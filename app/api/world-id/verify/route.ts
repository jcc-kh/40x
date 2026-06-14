import { NextRequest, NextResponse } from 'next/server'

import {
  assertNoExistingCredential,
  hasIssuedCredential,
  storeVerifiedNullifier,
} from '@/lib/nullifiers'
import {
  createDevNullifier,
  extractNullifierFromIdkitResponse,
  extractNullifierFromVerifyResponse,
  formatWorldIdVerifyError,
  getWorldIdConfig,
  isWorldIdDevBypassEnabled,
  isWorldIdDemoBypassAllowed,
  logWorldIdFailure,
} from '@/lib/worldid'
import { getWorldIdAction } from '@/lib/types'
import { isAddress } from 'viem'

import { issueWorldIdVerificationSeal } from '@/lib/worldid-seal'

export const runtime = 'nodejs'

function sealForAddress(nullifier: string, address?: string) {
  if (!address || !isAddress(address)) return undefined
  try {
    return issueWorldIdVerificationSeal(nullifier, address)
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  try {
    const { idkitResponse, ensName, signal, devBypass, address } = await request.json()
    const config = getWorldIdConfig()
    const action = getWorldIdAction()

    console.info('[World ID] verify request', {
      action,
      signal: signal ?? ensName ?? null,
      rpId: config.rpId,
      devBypass: devBypass === true,
      hasIdkitResponse: Boolean(idkitResponse),
    })

    if (devBypass === true) {
      if (isWorldIdDevBypassEnabled()) {
        const nullifier = createDevNullifier(signal ?? ensName, address)
        storeVerifiedNullifier(nullifier, signal ?? ensName, address)
        console.info('[World ID] dev bypass', {
          nullifier: nullifier.slice(0, 24) + '…',
          hasAddress: Boolean(address),
        })
        return NextResponse.json({
          success: true,
          nullifier,
          devBypass: true,
          alreadyIssuedCredential: hasIssuedCredential(nullifier),
          verificationSeal: sealForAddress(nullifier, address),
        })
      }

      if (isWorldIdDemoBypassAllowed()) {
        const nullifier = createDevNullifier(signal ?? ensName, address)
        storeVerifiedNullifier(nullifier, signal ?? ensName, address)
        console.info('[World ID] demo bypass used', {
          nullifier: nullifier.slice(0, 24) + '…',
        })
        return NextResponse.json({
          success: true,
          nullifier,
          devBypass: true,
          demoBypass: true,
          alreadyIssuedCredential: hasIssuedCredential(nullifier),
          verificationSeal: sealForAddress(nullifier, address),
        })
      }

      return NextResponse.json(
        {
          error:
            'World ID skip is disabled. Set SKIP_WORLD_ID_VERIFY=true on the server (Vercel env vars).',
        },
        { status: 403 },
      )
    }

    if (!config.rpId) {
      console.error('[World ID] verify rejected — missing WORLD_RP_ID')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!idkitResponse) {
      return NextResponse.json({ error: 'Missing idkitResponse' }, { status: 400 })
    }

    const verifyResponse = await fetch(
      `https://developer.worldcoin.org/api/v4/verify/${config.rpId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(idkitResponse),
      },
    )

    const verifyData = await verifyResponse.json()

    if (!verifyResponse.ok || !verifyData.success) {
      logWorldIdFailure('POST /api/world-id/verify — Worldcoin rejected proof', {
        action,
        signal: signal ?? ensName ?? null,
        rpId: config.rpId,
        httpStatus: verifyResponse.status,
      }, verifyData as Record<string, unknown>)

      const code = verifyData.code as string | undefined
      const terminalAlreadyVerified =
        code === 'nullifier_replayed' ||
        code === 'already_verified' ||
        code === 'max_verifications_reached'

      if (terminalAlreadyVerified) {
        const nullifierFromProof =
          extractNullifierFromIdkitResponse(idkitResponse) ??
          extractNullifierFromVerifyResponse(verifyData)

        if (nullifierFromProof) {
          const { finalizeReplayedWorldIdVerification } = await import('@/lib/worldid-recover')
          const finalized = finalizeReplayedWorldIdVerification(
            nullifierFromProof,
            signal,
            ensName,
            address,
          )
          console.info('[World ID] terminal code — using nullifier from proof', {
            code,
            nullifier: nullifierFromProof.slice(0, 16) + '…',
            alreadyIssuedCredential: finalized.alreadyIssuedCredential,
          })
          return NextResponse.json({
            ...finalized,
            worldcoinCode: code,
            verificationSeal: sealForAddress(nullifierFromProof, address),
          })
        }

        if (address && isAddress(address)) {
          const { recoverAlreadyVerifiedWorldId } = await import('@/lib/worldid-recover')
          const recovered = await recoverAlreadyVerifiedWorldId(address, signal ?? ensName)
          if (recovered) {
            console.info('[World ID] treating Worldcoin terminal code as recovered verification', {
              code,
              source: recovered.source,
            })
            return NextResponse.json({
              success: true,
              nullifier: recovered.nullifier,
              recovered: true,
              alreadyIssuedCredential: recovered.alreadyIssuedCredential,
              worldcoinCode: code,
              verificationSeal: sealForAddress(recovered.nullifier, address),
            })
          }
        }
      }

      return NextResponse.json(
        {
          error: formatWorldIdVerifyError(verifyData),
          code: verifyData.code,
          details: verifyData,
        },
        { status: 400 },
      )
    }

    const nullifier = extractNullifierFromVerifyResponse(verifyData)
    if (!nullifier) {
      logWorldIdFailure('verify succeeded but no nullifier in response', {
        action,
        rpId: config.rpId,
      }, verifyData as Record<string, unknown>)
      return NextResponse.json({ error: 'No nullifier returned from World ID' }, { status: 400 })
    }

    try {
      assertNoExistingCredential(nullifier)
    } catch (error) {
      if (hasIssuedCredential(nullifier)) {
        console.info('[World ID] credential already issued — returning recovered success', {
          nullifier: nullifier.slice(0, 16) + '…',
        })
        return NextResponse.json({
          success: true,
          nullifier,
          recovered: true,
          alreadyIssuedCredential: true,
          verificationSeal: sealForAddress(nullifier, address),
        })
      }
      console.error('[World ID] local duplicate credential block', {
        action,
        nullifier: nullifier.slice(0, 16) + '…',
        message: error instanceof Error ? error.message : error,
      })
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Duplicate credential' },
        { status: 409 },
      )
    }

    storeVerifiedNullifier(nullifier, signal ?? ensName, address)
    console.info('[World ID] verify success', {
      action,
      nullifier: nullifier.slice(0, 16) + '…',
    })

    return NextResponse.json({
      success: true,
      nullifier,
      verificationSeal: sealForAddress(nullifier, address),
    })
  } catch (error) {
    console.error('[World ID] verify unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
