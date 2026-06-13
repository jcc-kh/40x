package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var jsonFenceRe = regexp.MustCompile("(?s)^```(?:json)?\\s*([\\s\\S]*?)\\s*```$")

func cleanJSON(text string) string {
	text = strings.TrimSpace(text)
	if match := jsonFenceRe.FindStringSubmatch(text); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	if match := regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```").FindStringSubmatch(text); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return text
}

func toBytes32Hex(hex string) (string, error) {
	h := strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(hex), "0x"), "0X")
	if len(h) != 64 {
		return "", fmt.Errorf("expected 32-byte hex digest, got %q", hex)
	}
	return "0x" + strings.ToLower(h), nil
}

func extractTranscriptHash(callback InferenceCallback) (string, error) {
	if len(callback.Resources) > 0 && callback.Resources[0].ResponseDigest != "" {
		return toBytes32Hex(callback.Resources[0].ResponseDigest)
	}
	return "", fmt.Errorf("missing resources[0].response_digest in callback")
}

func extractDocumentDigest(callback InferenceCallback) string {
	if callback.DocumentDigest != "" {
		return callback.DocumentDigest
	}
	if len(callback.Resources) > 0 && callback.Resources[0].Digest != "" {
		return callback.Resources[0].Digest
	}
	if len(callback.ResourceSummaries) > 0 && callback.ResourceSummaries[0].Digest != "" {
		return callback.ResourceSummaries[0].Digest
	}
	return ""
}

func parseChecksFromOutput(output string) (ChecksResponse, error) {
	raw := cleanJSON(output)
	var checksResp ChecksResponse
	if err := json.Unmarshal([]byte(raw), &checksResp); err != nil {
		return ChecksResponse{}, fmt.Errorf("failed to parse checks JSON: %w", err)
	}
	return checksResp, nil
}

func parseInferenceCallback(input []byte) (InferenceCallback, error) {
	var callback InferenceCallback
	if err := json.Unmarshal(input, &callback); err != nil {
		return InferenceCallback{}, fmt.Errorf("failed to parse callback: %w", err)
	}
	return callback, nil
}

func processInferenceCallback(callback InferenceCallback, thresholdUSD int, tenantAddress string) (WorkflowSummary, error) {
	summary := WorkflowSummary{
		ID:                callback.ID,
		Status:            callback.Status,
		Tenant:            tenantAddress,
		ConsumerAddress:   "",
		ChainSelectorName: "",
	}

	if callback.Status != "completed" {
		summary.Reason = fmt.Sprintf("status is %q, expected completed", callback.Status)
		return summary, nil
	}

	transcriptHash, err := extractTranscriptHash(callback)
	if err != nil {
		return summary, err
	}

	documentDigest := extractDocumentDigest(callback)
	checksResp, err := parseChecksFromOutput(callback.Output)
	if err != nil {
		return summary, err
	}

	attestation := buildAttestation(
		checksResp.Checks,
		thresholdUSD,
		checksResp.Flags,
		callback.ID,
		transcriptHash,
		documentDigest,
	)

	summary.Verified = attestation.Verified
	summary.Reason = buildReason(attestation)
	summary.DocumentOwnershipVerified = attestation.DocumentOwnershipVerified
	summary.DocumentsConsistent = attestation.DocumentsConsistent
	summary.IncomeVerified = attestation.IncomeVerified
	summary.IncomeRange = attestation.IncomeRange
	summary.EmploymentStable = attestation.EmploymentStable
	summary.ConfidenceScore = attestation.ConfidenceScore
	summary.TranscriptHash = transcriptHash
	summary.DocumentDigest = documentDigest

	return summary, nil
}
