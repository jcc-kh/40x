import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DocumentAttestation } from './types'

const RESULT_MARKER = 'Workflow Simulation Result:'

export async function runCRECallbackSimulation(
  callbackPayloadPath?: string,
): Promise<DocumentAttestation> {
  const workflowPath = process.env.CRE_WORKFLOW_PATH ?? join(process.cwd(), 'cre-workflow')
  const creCli = process.env.CRE_CLI_PATH ?? 'cre'
  const payloadPath =
    callbackPayloadPath ?? join(workflowPath, 'simulation', 'callback-payload.json')

  const stdout = await execCRESimulate(creCli, workflowPath, payloadPath)
  const summary = parseSimulationSummary(stdout)

  return {
    verified: summary.verified,
    documentOwnershipVerified: summary.documentOwnershipVerified,
    documentsConsistent: summary.documentsConsistent,
    incomeVerified: summary.incomeVerified,
    incomeRange: summary.incomeRange,
    employmentStable: summary.employmentStable,
    confidenceScore: summary.confidenceScore,
    flags: '',
    inferenceId: summary.id,
    transcriptHash: summary.transcriptHash,
    documentDigest: summary.documentDigest,
  }
}

export async function runCRECallbackSimulationFromFixture(): Promise<DocumentAttestation> {
  return runCRECallbackSimulation()
}

function execCRESimulate(creCli: string, workflowPath: string, payloadPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      creCli,
      [
        'workflow',
        'simulate',
        workflowPath,
        '--target',
        'staging-settings',
        '--non-interactive',
        '--trigger-index',
        '0',
        '--http-payload',
        payloadPath,
      ],
      { env: process.env },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('CRE workflow simulation timed out after 90 seconds'))
    }, 90_000)

    child.on('error', (error) => {
      clearTimeout(timeout)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'CRE CLI not found. Install with: curl -sSL https://app.chain.link/cre/install.sh | bash',
          ),
        )
        return
      }
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `CRE simulate exited with code ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

interface WorkflowSummary {
  id: string
  verified: boolean
  documentOwnershipVerified: boolean
  documentsConsistent: boolean
  incomeVerified: boolean
  incomeRange: string
  employmentStable: boolean
  confidenceScore: string
  transcriptHash: string
  documentDigest: string
}

export function parseSimulationSummary(stdout: string): WorkflowSummary {
  const markerIndex = stdout.indexOf(RESULT_MARKER)
  if (markerIndex === -1) {
    throw new Error('Could not find workflow simulation result in CRE output')
  }

  const afterMarker = stdout.slice(markerIndex + RESULT_MARKER.length).trim()
  const jsonStart = afterMarker.indexOf('{')
  const jsonEnd = afterMarker.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error(`Unexpected CRE simulation output: ${afterMarker.slice(0, 200)}`)
  }

  return JSON.parse(afterMarker.slice(jsonStart, jsonEnd + 1)) as WorkflowSummary
}

export async function writeTempCallbackPayload(callback: unknown): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), '40x-cb-'))
  const payloadPath = join(tempDir, 'callback.json')
  await writeFile(payloadPath, JSON.stringify(callback), 'utf8')
  return payloadPath
}

export async function cleanupTempPath(path: string) {
  const dir = join(path, '..')
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
}

export async function runCREWithCallbackBody(callbackBody: unknown): Promise<DocumentAttestation> {
  const payloadPath = await writeTempCallbackPayload(callbackBody)
  try {
    return await runCRECallbackSimulation(payloadPath)
  } finally {
    await cleanupTempPath(payloadPath)
  }
}

export async function loadFixtureCallback(): Promise<unknown> {
  const workflowPath = process.env.CRE_WORKFLOW_PATH ?? join(process.cwd(), 'cre-workflow')
  const raw = await readFile(join(workflowPath, 'simulation', 'callback-payload.json'), 'utf8')
  return JSON.parse(raw) as unknown
}
