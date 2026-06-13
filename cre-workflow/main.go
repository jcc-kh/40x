//go:build wasip1

package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/smartcontractkit/cre-sdk-go/capabilities/networking/confidentialhttp"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/cre"
	"github.com/smartcontractkit/cre-sdk-go/cre/wasm"
)

type Config struct {
	GeminiURL string `json:"geminiUrl"`
}

type DocumentInput struct {
	PassportText     string `json:"passportText"`
	BankText         string `json:"bankText"`
	PayrollText      string `json:"payrollText"`
	ThresholdUSD     int    `json:"thresholdUSD"`
	WorldIDNullifier string `json:"worldIdNullifier"`
}

type GeminiRequest struct {
	Contents []GeminiContent `json:"contents"`
}

type GeminiContent struct {
	Parts []GeminiPart `json:"parts"`
}

type GeminiPart struct {
	Text string `json:"text"`
}

type GeminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func InitWorkflow(config *Config, logger *slog.Logger, secretsProvider cre.SecretsProvider) (cre.Workflow[*Config], error) {
	httpTrigger := http.Trigger(&http.Config{
		AuthorizedKeys: []*http.AuthorizedKey{},
	})

	return cre.Workflow[*Config]{
		cre.Handler(httpTrigger, onHttpTrigger),
	}, nil
}

func onHttpTrigger(config *Config, runtime cre.Runtime, payload *http.Payload) (*AttestationResult, error) {
	logger := runtime.Logger()

	var input DocumentInput
	if err := json.Unmarshal(payload.Input, &input); err != nil {
		return nil, fmt.Errorf("failed to parse input: %w", err)
	}

	if input.ThresholdUSD <= 0 {
		input.ThresholdUSD = 5000
	}

	logger.Info("Received document verification request")

	secret, err := runtime.GetSecret(&cre.SecretRequest{Id: "GEMINI_API_KEY"}).Await()
	if err != nil {
		return nil, fmt.Errorf("failed to get Gemini API key: %w", err)
	}

	prompt := buildVerificationPrompt(input)
	_ = secret
	checksResp, err := callGeminiConfidential(config, runtime, prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to call Gemini: %w", err)
	}

	result := buildAttestation(checksResp.Checks, input.ThresholdUSD, checksResp.Flags)
	result.WorldIDNullifier = input.WorldIDNullifier

	logger.Info("Attestation complete", "verified", result.Verified, "incomeRange", result.IncomeRange, "confidence", result.ConfidenceScore)

	return &result, nil
}

func buildVerificationPrompt(input DocumentInput) string {
	return fmt.Sprintf(`You are a financial document verification AI. Analyze the extracted text from three documents and return ONLY valid JSON.

PASSPORT TEXT:
%s

BANK STATEMENT TEXT:
%s

PAYROLL TEXT:
%s

INCOME THRESHOLD TO VERIFY: $%d/month

Extract structured checks:
1. nameMatch — does the legal name match across passport, bank account holder, and payroll employee? Use "full", "partial", or "none".
2. depositMonths — count distinct months with salary-like recurring deposits in the bank text (integer 0-12).
3. payrollEmployerMonths — count months with the same employer on payroll (integer 0-12).
4. bankPayrollAmountMatch — true if payroll amounts align with bank deposits within ~10%%.
5. monthlyIncomeUSD — estimated average monthly income in USD (integer).
6. documentQuality — "high", "medium", or "low" based on text completeness.

Also return flags: comma-separated issues found, or empty string.

Return ONLY this JSON, no markdown:
{
  "checks": {
    "nameMatch": "full|partial|none",
    "depositMonths": 0,
    "payrollEmployerMonths": 0,
    "bankPayrollAmountMatch": true,
    "monthlyIncomeUSD": 0,
    "documentQuality": "high|medium|low"
  },
  "flags": ""
}`, input.PassportText, input.BankText, input.PayrollText, input.ThresholdUSD)
}

func callGeminiConfidential(config *Config, runtime cre.Runtime, prompt string) (*GeminiChecksResponse, error) {
	geminiReq := GeminiRequest{
		Contents: []GeminiContent{
			{Parts: []GeminiPart{{Text: prompt}}},
		},
	}

	body, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Gemini request: %w", err)
	}

	client := confidentialhttp.Client{}
	resp, err := client.SendRequest(runtime, &confidentialhttp.ConfidentialHTTPRequest{
		Request: &confidentialhttp.HTTPRequest{
			Url:    config.GeminiURL + "?key={{.GEMINI_API_KEY}}",
			Method: "POST",
			Body:   &confidentialhttp.HTTPRequest_BodyBytes{BodyBytes: body},
			MultiHeaders: map[string]*confidentialhttp.HeaderValues{
				"Content-Type": {Values: []string{"application/json"}},
			},
			EncryptOutput: false,
		},
		VaultDonSecrets: []*confidentialhttp.SecretIdentifier{
			{Key: "GEMINI_API_KEY"},
		},
	}).Await()
	if err != nil {
		return nil, fmt.Errorf("Gemini API call failed: %w", err)
	}

	var geminiResp GeminiResponse
	if err := json.Unmarshal(resp.Body, &geminiResp); err != nil {
		return nil, fmt.Errorf("failed to parse Gemini response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty Gemini response")
	}

	raw := cleanJSON(geminiResp.Candidates[0].Content.Parts[0].Text)

	var checksResp GeminiChecksResponse
	if err := json.Unmarshal([]byte(raw), &checksResp); err != nil {
		return nil, fmt.Errorf("failed to parse checks JSON from Gemini: %w, raw: %s", err, raw)
	}

	return &checksResp, nil
}

var jsonFenceRe = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")

func cleanJSON(text string) string {
	text = strings.TrimSpace(text)
	if match := jsonFenceRe.FindStringSubmatch(text); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return text
}

func main() {
	wasm.NewRunner(cre.ParseJSON[Config]).Run(InitWorkflow)
}
