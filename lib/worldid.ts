import { WORLD_ID_ACTION } from './types'

export function getWorldIdConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
    rpId: process.env.WORLD_RP_ID ?? '',
    signingKey: process.env.RP_SIGNING_KEY ?? '',
    action: WORLD_ID_ACTION,
  }
}

export function extractNullifierFromVerifyResponse(data: {
  results?: Array<{ nullifier?: string; success?: boolean }>
  nullifier?: string
}): string | null {
  if (data.nullifier) return data.nullifier
  const success = data.results?.find((result) => result.success && result.nullifier)
  return success?.nullifier ?? null
}
