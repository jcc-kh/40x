package main

import "testing"

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

func TestBuildAttestationPartialData(t *testing.T) {
	checks := VerificationChecks{
		NameMatch:              "full",
		DepositMonths:          1,
		PayrollEmployerMonths:  1,
		BankPayrollAmountMatch: true,
		MonthlyIncomeUSD:       6500,
		DocumentQuality:        "medium",
	}

	result := buildAttestation(checks, 5000, "only 1 month of deposits")
	if !result.Verified {
		t.Fatalf("expected verified=true for score >= 0.70")
	}
	if result.IncomeRange != "5k-7k" {
		t.Fatalf("expected 5k-7k, got %s", result.IncomeRange)
	}
}
