/** Shared registry parent, e.g. `rentals.zkcred.eth`. */
export function getRegistryParent(): string | null {
  const parent = process.env.NEXT_PUBLIC_REGISTRY_PARENT?.trim().toLowerCase()
  if (!parent?.endsWith('.eth')) return null
  return parent
}

/** Deterministic registry subname for a tenant wallet. */
export function getRegistrySubname(address: string): string | null {
  const parent = getRegistryParent()
  if (!parent) return null
  const id = address.toLowerCase().replace(/^0x/, '').slice(0, 8)
  if (!id) return null
  return `${id}.${parent}`
}

export function isRegistryName(name: string): boolean {
  const parent = getRegistryParent()
  if (!parent) return false
  return name.trim().toLowerCase().endsWith(`.${parent}`)
}
