import { createSiweMessage, verifySiweMessage } from 'viem/siwe'
import type { Address } from 'viem'

import { createEnsPublicClient } from './ens'

export function buildPresentationSiweMessage(params: {
  address: Address
  domain: string
  uri: string
  nonce: string
  chainId: number
}) {
  return createSiweMessage({
    address: params.address,
    domain: params.domain,
    uri: params.uri,
    version: '1',
    chainId: params.chainId,
    nonce: params.nonce,
    statement: 'Present my zkCredentials screening credential to a landlord.',
  })
}

export async function verifyPresentationSiwe(params: {
  message: string
  signature: `0x${string}`
  address: Address
  domain: string
  nonce: string
}) {
  const client = createEnsPublicClient()
  return verifySiweMessage(client, {
    message: params.message,
    signature: params.signature,
    address: params.address,
    domain: params.domain,
    nonce: params.nonce,
  })
}
