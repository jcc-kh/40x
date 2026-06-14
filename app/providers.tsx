'use client'

import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { mainnet, sepolia, type Chain } from 'wagmi/chains'

import { getEnsChainId } from '@/lib/ens'

import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

const ensChainId = getEnsChainId()
const chains: [Chain, ...Chain[]] =
  ensChainId === mainnet.id ? [mainnet, sepolia] : [sepolia, mainnet]

const config = getDefaultConfig({
  appName: 'zkCredentials',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '00000000000000000000000000000000',
  chains,
  ssr: true,
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
