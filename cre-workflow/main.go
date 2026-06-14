//go:build wasip1

package main

import (
	"fmt"
	"log/slog"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/cre"
	"github.com/smartcontractkit/cre-sdk-go/cre/wasm"
	"github.com/smartcontractkit/chainlink-protos/cre/go/sdk"
)

type Config struct {
	ConsumerAddress   string `json:"consumerAddress"`
	ChainSelectorName string `json:"chainSelectorName"`
	TenantAddress     string `json:"tenantAddress"`
	ThresholdUSD      int    `json:"thresholdUSD"`
}

func InitWorkflow(config *Config, logger *slog.Logger, secretsProvider cre.SecretsProvider) (cre.Workflow[*Config], error) {
	httpTrigger := http.Trigger(&http.Config{
		AuthorizedKeys: []*http.AuthorizedKey{},
	})

	return cre.Workflow[*Config]{
		cre.Handler(httpTrigger, onHttpTrigger),
	}, nil
}

func onHttpTrigger(config *Config, runtime cre.Runtime, payload *http.Payload) (*WorkflowSummary, error) {
	logger := runtime.Logger()

	callback, err := parseInferenceCallback(payload.Input)
	if err != nil {
		return nil, err
	}

	logger.Info(
		"Inference callback received",
		"id", callback.ID,
		"status", callback.Status,
	)

	thresholdUSD := config.ThresholdUSD
	if thresholdUSD <= 0 {
		thresholdUSD = 5000
	}

	tenantAddress := config.TenantAddress
	if tenantAddress == "" {
		tenantAddress = "0x0000000000000000000000000000000000000001"
	}

	summary, err := processInferenceCallback(callback, thresholdUSD, tenantAddress)
	if err != nil {
		return nil, err
	}

	summary.ConsumerAddress = config.ConsumerAddress
	summary.ChainSelectorName = config.ChainSelectorName

	if callback.Status == "completed" {
		logger.Info(
			"LLM screening decision",
			"verified", summary.Verified,
			"incomeRange", summary.IncomeRange,
			"confidence", summary.ConfidenceScore,
		)
		logger.Info(
			"Attester digests",
			"transcriptHash", summary.TranscriptHash,
			"documentDigest", summary.DocumentDigest,
		)

		if config.ConsumerAddress != "" && config.ConsumerAddress != "0x0000000000000000000000000000000000000000" {
			writeErr := attemptOnChainWrite(runtime, config, summary)
			summary.Write.Attempted = true
			if writeErr != nil {
				summary.Write.Error = writeErr.Error()
				logger.Info("On-chain write failed", "error", writeErr.Error())
			}
		}
	}

	return &summary, nil
}

func attemptOnChainWrite(runtime cre.Runtime, config *Config, summary WorkflowSummary) error {
	addressType, _ := abi.NewType("address", "", nil)
	boolType, _ := abi.NewType("bool", "", nil)
	stringType, _ := abi.NewType("string", "", nil)
	bytes32Type, _ := abi.NewType("bytes32", "", nil)

	args := abi.Arguments{
		{Type: addressType},
		{Type: boolType},
		{Type: stringType},
		{Type: bytes32Type},
		{Type: stringType},
	}

	transcriptHash := common.HexToHash(summary.TranscriptHash)

	encoded, err := args.Pack(
		common.HexToAddress(config.TenantAddress),
		summary.Verified,
		summary.Reason,
		transcriptHash,
		summary.ID,
	)
	if err != nil {
		return fmt.Errorf("abi encode failed: %w", err)
	}

	_, err = runtime.GenerateReport(&sdk.ReportRequest{
		EncodedPayload: encoded,
	}).Await()
	return err
}

func main() {
	wasm.NewRunner(cre.ParseJSON[Config]).Run(InitWorkflow)
}
