export const WORLD_ID_TERMINAL_ALREADY_VERIFIED_CODES = [
  'nullifier_replayed',
  'max_verifications_reached',
  'already_verified',
] as const

export function isTerminalAlreadyVerifiedError(error: unknown): boolean {
  const text = String(error ?? '').toLowerCase()
  return (
    WORLD_ID_TERMINAL_ALREADY_VERIFIED_CODES.some((code) => text.includes(code)) ||
    /already verified/.test(text)
  )
}
