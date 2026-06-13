package main

type VerificationChecks struct {
	NameMatch              string `json:"nameMatch"`
	DepositMonths          int    `json:"depositMonths"`
	PayrollEmployerMonths  int    `json:"payrollEmployerMonths"`
	BankPayrollAmountMatch bool   `json:"bankPayrollAmountMatch"`
	MonthlyIncomeUSD       int    `json:"monthlyIncomeUSD"`
	DocumentQuality        string `json:"documentQuality"`
}

type AttestationResult struct {
	Verified         bool   `json:"verified" consensus_aggregation:"identical"`
	IncomeVerified   bool   `json:"incomeVerified" consensus_aggregation:"identical"`
	IdentityVerified bool   `json:"identityVerified" consensus_aggregation:"identical"`
	IncomeRange      string `json:"incomeRange" consensus_aggregation:"identical"`
	EmployerStable   bool   `json:"employerStable" consensus_aggregation:"identical"`
	ConfidenceScore  string `json:"confidenceScore" consensus_aggregation:"identical"`
	Flags            string `json:"flags" consensus_aggregation:"identical"`
	WorldIDNullifier string `json:"worldIdNullifier" consensus_aggregation:"identical"`
}

type GeminiChecksResponse struct {
	Checks VerificationChecks `json:"checks"`
	Flags  string             `json:"flags"`
}
