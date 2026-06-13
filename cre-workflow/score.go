package main

import (
	"fmt"
	"math"
	"strings"
)

func scoreNameMatch(value string) float64 {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "full":
		return 1.0
	case "partial":
		return 0.5
	default:
		return 0.0
	}
}

func scoreMonths(months int) float64 {
	if months <= 0 {
		return 0.0
	}
	return math.Min(float64(months)/3.0, 1.0)
}

func scoreIncome(monthlyIncomeUSD, thresholdUSD int) float64 {
	if monthlyIncomeUSD <= 0 || thresholdUSD <= 0 {
		return 0.0
	}
	return math.Min(float64(monthlyIncomeUSD)/float64(thresholdUSD), 1.0)
}

func scoreDocumentQuality(value string) float64 {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "high":
		return 1.0
	case "medium":
		return 0.6
	case "low":
		return 0.2
	default:
		return 0.2
	}
}

func computeConfidenceScore(checks VerificationChecks, thresholdUSD int) float64 {
	documentOwnership := scoreNameMatch(checks.NameMatch)
	income := scoreIncome(checks.MonthlyIncomeUSD, thresholdUSD)
	depositStability := scoreMonths(checks.DepositMonths)
	employmentStability := scoreMonths(checks.PayrollEmployerMonths)
	crossDoc := 0.0
	if checks.BankPayrollAmountMatch {
		crossDoc = 1.0
	}
	quality := scoreDocumentQuality(checks.DocumentQuality)

	score := 0.25*documentOwnership +
		0.25*income +
		0.20*depositStability +
		0.15*employmentStability +
		0.10*crossDoc +
		0.05*quality

	return math.Round(score*100) / 100
}

func bucketIncomeRange(monthlyIncomeUSD, thresholdUSD int) string {
	if monthlyIncomeUSD <= 0 {
		return "unknown"
	}
	if monthlyIncomeUSD < thresholdUSD {
		return "below-threshold"
	}
	switch {
	case monthlyIncomeUSD < 7000:
		return "5k-7k"
	case monthlyIncomeUSD < 10000:
		return "7k-10k"
	case monthlyIncomeUSD < 15000:
		return "10k-15k"
	default:
		return "15k+"
	}
}

func buildAttestation(
	checks VerificationChecks,
	thresholdUSD int,
	flags string,
	inferenceID string,
	transcriptHash string,
	documentDigest string,
) AttestationResult {
	confidence := computeConfidenceScore(checks, thresholdUSD)
	documentOwnershipVerified := strings.EqualFold(strings.TrimSpace(checks.NameMatch), "full")
	documentsConsistent := checks.BankPayrollAmountMatch && checks.DepositMonths >= 2
	incomeVerified := checks.MonthlyIncomeUSD >= thresholdUSD && checks.MonthlyIncomeUSD > 0
	employmentStable := checks.PayrollEmployerMonths >= 3
	verified := documentOwnershipVerified && documentsConsistent && incomeVerified && confidence >= 0.70

	return AttestationResult{
		Verified:                  verified,
		DocumentOwnershipVerified: documentOwnershipVerified,
		DocumentsConsistent:       documentsConsistent,
		IncomeVerified:            incomeVerified,
		IncomeRange:               bucketIncomeRange(checks.MonthlyIncomeUSD, thresholdUSD),
		EmploymentStable:          employmentStable,
		ConfidenceScore:           fmt.Sprintf("%.2f", confidence),
		Flags:                     strings.TrimSpace(flags),
		InferenceID:               inferenceID,
		TranscriptHash:            transcriptHash,
		DocumentDigest:            documentDigest,
	}
}

func buildReason(attestation AttestationResult) string {
	if attestation.Verified {
		return fmt.Sprintf(
			"Tenant screening passed: income %s, confidence %s",
			attestation.IncomeRange,
			attestation.ConfidenceScore,
		)
	}
	if attestation.Flags != "" {
		return attestation.Flags
	}
	return "Tenant screening did not meet verification thresholds"
}
