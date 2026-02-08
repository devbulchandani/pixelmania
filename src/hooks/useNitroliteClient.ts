'use client';

import { useMemo, useCallback } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import type { Hex } from 'viem';
import { base } from 'viem/chains';
import { NitroliteClient, SessionKeyStateSigner } from '@erc7824/nitrolite';
import {
  CUSTODY_ADDRESS,
  ADJUDICATOR_ADDRESS,
  CHALLENGE_DURATION,
} from '@/utils/yellowConstants';
import { basePublicClient } from '@/lib/viemClients';
import { getSessionKey } from '@/hooks/useYellow';

export function useNitroliteClient() {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const isCorrectChain = chain?.id === base.id;

  const nitroliteClient = useMemo(() => {
    if (!walletClient || !basePublicClient || !isCorrectChain || !address) {
      return null;
    }

    try {
      // Session key signs channel states (Yellow Network pattern)
      const sessionKey = getSessionKey();
      const stateSigner = new SessionKeyStateSigner(sessionKey.privateKey);

      console.log('[Nitrolite] Session key:', stateSigner.getAddress().slice(0, 10) + '...');
      console.log('[Nitrolite] Main wallet:', address.slice(0, 10) + '...');

      return new NitroliteClient({
        publicClient: basePublicClient as any,
        walletClient: walletClient as any,
        stateSigner,
        addresses: {
          custody: CUSTODY_ADDRESS,
          adjudicator: ADJUDICATOR_ADDRESS,
        },
        chainId: base.id,
        challengeDuration: CHALLENGE_DURATION,
      });
    } catch (err) {
      console.error('[Nitrolite] Init error:', err);
      return null;
    }
  }, [walletClient, basePublicClient, isCorrectChain, address]);

  const ensureCorrectChain = useCallback(async () => {
    if (!isConnected) throw new Error('Wallet not connected');
    if (chain?.id === base.id) return;

    console.log(`[Nitrolite] Switching to Base...`);
    await switchChainAsync({ chainId: base.id });
    await new Promise(resolve => setTimeout(resolve, 500));
  }, [isConnected, chain, switchChainAsync]);

  return {
    nitroliteClient,
    walletClient: walletClient ?? null,
    address,
    isConnected,
    isCorrectChain,
    ensureCorrectChain,
  };
}
