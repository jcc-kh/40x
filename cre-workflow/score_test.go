package main

import (
	"os"
	"testing"
)

func TestComputeConfidenceScore(t *testing.T) {
	checks := VerificationChecks{
		NameMatch:              "full",
		DepositMonths:          3,
		PayrollEmployerMonths:  3,
		BankPayrollAmountMatch: true,
		MonthlyIncomeUSD:       6500,
		DocumentQuality:        "high",
	}

	score := computeConfidenceScore(checks, 5000)
	if score != 1.0 {
		t.Fatalf("expected 1.0, got %v", score)
	}
}

func TestBuildAttestationVerified(t *testing.T) {
	checks := VerificationChecks{
		NameMatch:              "full",
		DepositMonths:          3,
		PayrollEmployerMonths:  4,
		BankPayrollAmountMatch: true,
		MonthlyIncomeUSD:       6200,
		DocumentQuality:        "high",
	}

	result := buildAttestation(checks, 5000, "", "inf-1", "0x0a0124911560a2236e432d30c3e2a90b0666f4c84b40bf10ba01960595c6ecea", "digest-1")
	if !result.Verified {
		t.Fatalf("expected verified=true")
	}
	if !result.DocumentOwnershipVerified {
		t.Fatalf("expected documentOwnershipVerified=true")
	}
	if !result.DocumentsConsistent {
		t.Fatalf("expected documentsConsistent=true")
	}
	if result.IncomeRange != "5k-7k" {
		t.Fatalf("expected 5k-7k, got %s", result.IncomeRange)
	}
	if result.EmploymentStable != true {
		t.Fatalf("expected employmentStable=true")
	}
}

func TestProcessInferenceCallbackFixture(t *testing.T) {
	raw, err := os.ReadFile("simulation/callback-payload.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	callback, err := parseInferenceCallback(raw)
	if err != nil {
		t.Fatalf("parse callback: %v", err)
	}

	summary, err := processInferenceCallback(callback, 5000, "0x0000000000000000000000000000000000000001")
	if err != nil {
		t.Fatalf("process callback: %v", err)
	}

	if !summary.Verified {
		t.Fatalf("expected verified screening result")
	}
	if summary.TranscriptHash != "0x0a0124911560a2236e432d30c3e2a90b0666f4c84b40bf10ba01960595c6ecea" {
		t.Fatalf("unexpected transcript hash: %s", summary.TranscriptHash)
	}
	if summary.DocumentDigest == "" {
		t.Fatalf("expected document digest")
	}
}

func TestParseChecksFromFencedOutput(t *testing.T) {
	output := "```json\n{\"checks\":{\"nameMatch\":\"full\",\"depositMonths\":2,\"payrollEmployerMonths\":3,\"bankPayrollAmountMatch\":true,\"monthlyIncomeUSD\":6000,\"documentQuality\":\"medium\"},\"flags\":\"\"}\n```"
	resp, err := parseChecksFromOutput(output)
	if err != nil {
		t.Fatalf("parse checks: %v", err)
	}
	if resp.Checks.NameMatch != "full" {
		t.Fatalf("expected full name match")
	}
}
