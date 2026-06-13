import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AttestationResult, DocumentInput } from './types'

const RESULT_MARKER = 'Workflow Simulation Result:'

export async function runCRESimulation(input: DocumentInput): Promise<AttestationResult> {
  const workflowPath = process.env.CRE_WORKFLOW_PATH ?? join(process.cwd(), 'cre-workflow')
  const creCli = process.env.CRE_CLI_PATH ?? 'cre'
  const payload = JSON.stringify(input)

  const tempDir = await mkdtemp(join(tmpdir(), 'zkcred-'))
  const payloadPath = join(tempDir, 'payload.json')

  try {
    await writeFile(payloadPath, payload, 'utf8')

    const stdout = await execCRESimulate(creCli, workflowPath, payloadPath)
    return parseSimulationResult(stdout)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
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
      reject(new Error('CRE workflow simulation timed out after 60 seconds'))
    }, 60_000)

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

export function parseSimulationResult(stdout: string): AttestationResult {
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

  const parsed = JSON.parse(afterMarker.slice(jsonStart, jsonEnd + 1)) as AttestationResult
  return parsed
}
