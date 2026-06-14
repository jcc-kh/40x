const STORAGE_PREFIX = '40x-session'
const CHANNEL_NAME = '40x-session-complete'

export function sessionStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`
}

export function saveVerifiedSessionSeal(sessionId: string, sessionSeal: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(sessionStorageKey(sessionId), sessionSeal)
}

export function loadVerifiedSessionSeal(sessionId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(sessionStorageKey(sessionId))
}

export function publishVerifiedSession(sessionId: string, sessionSeal: string): void {
  saveVerifiedSessionSeal(sessionId, sessionSeal)
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.postMessage({ sessionId, sessionSeal })
  channel.close()
}

export function subscribeVerifiedSession(
  onVerified: (sessionId: string, sessionSeal: string) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {}
  }

  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<{ sessionId?: string; sessionSeal?: string }>) => {
    if (!event.data?.sessionId || !event.data.sessionSeal) return
    onVerified(event.data.sessionId, event.data.sessionSeal)
  }

  return () => channel.close()
}
