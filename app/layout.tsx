import type { Metadata } from 'next'

import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'zkCredentials',
  description: 'Privacy-preserving income credentials on ENS, verified by World ID and Chainlink TEE',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: 'light' }}>
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
