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
	Verified                  bool   `json:"verified" consensus_aggregation:"identical"`
	DocumentOwnershipVerified bool   `json:"documentOwnershipVerified" consensus_aggregation:"identical"`
	DocumentsConsistent       bool   `json:"documentsConsistent" consensus_aggregation:"identical"`
	IncomeVerified            bool   `json:"incomeVerified" consensus_aggregation:"identical"`
	IncomeRange               string `json:"incomeRange" consensus_aggregation:"identical"`
	EmploymentStable          bool   `json:"employmentStable" consensus_aggregation:"identical"`
	ConfidenceScore           string `json:"confidenceScore" consensus_aggregation:"identical"`
	Flags                     string `json:"flags" consensus_aggregation:"identical"`
	InferenceID               string `json:"inferenceId" consensus_aggregation:"identical"`
	TranscriptHash            string `json:"transcriptHash" consensus_aggregation:"identical"`
	DocumentDigest            string `json:"documentDigest" consensus_aggregation:"identical"`
}

type ChecksResponse struct {
	Checks VerificationChecks `json:"checks"`
	Flags  string             `json:"flags"`
}

type InferenceCallback struct {
	ID                string `json:"id"`
	Status            string `json:"status"`
	Output            string `json:"output"`
	DocumentDigest    string `json:"documentDigest"`
	ResourceSummaries []struct {
		Digest   string `json:"digest"`
		Filename string `json:"filename"`
	} `json:"resource_summaries"`
	Resources []struct {
		Digest          string `json:"digest"`
		RequestDigest   string `json:"request_digest"`
		ResponseDigest  string `json:"response_digest"`
	} `json:"resources"`
}

type WorkflowSummary struct {
	ID                        string `json:"id"`
	Status                    string `json:"status"`
	Tenant                    string `json:"tenant"`
	Verified                  bool   `json:"verified"`
	Reason                    string `json:"reason"`
	DocumentOwnershipVerified bool   `json:"documentOwnershipVerified"`
	DocumentsConsistent       bool   `json:"documentsConsistent"`
	IncomeVerified            bool   `json:"incomeVerified"`
	IncomeRange               string `json:"incomeRange"`
	EmploymentStable          bool   `json:"employmentStable"`
	ConfidenceScore           string `json:"confidenceScore"`
	TranscriptHash            string `json:"transcriptHash"`
	DocumentDigest            string `json:"documentDigest"`
	ConsumerAddress           string `json:"consumerAddress"`
	ChainSelectorName         string `json:"chainSelectorName"`
	Write                     struct {
		Attempted bool   `json:"attempted"`
		TxHash    string `json:"txHash,omitempty"`
		Error     string `json:"error,omitempty"`
	} `json:"write"`
}
