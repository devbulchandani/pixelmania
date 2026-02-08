'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, WagmiProvider, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';
import { useState } from 'react';

const config = createConfig({
  chains: [base],
  connectors: [metaMask({
      infuraAPIKey: process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL_BASE_MAINNET!,
    })],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL_BASE_MAINNET || 'https://mainnet.base.org'),
  },
  multiInjectedProviderDiscovery: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
