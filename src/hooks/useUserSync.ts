'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { syncUser, getUserByAddress } from '@/app/actions/user';
import { getActiveSession, getUserGameHistory } from '@/app/actions/gameSession';
import type { UserData } from '@/app/actions/user';
import type { GameSessionData } from '@/app/actions/gameSession';
import type { Address } from 'viem';

export function useUserSync() {
  const { address, isConnected } = useAccount();
  const hasSyncedRef = useRef(false);

  const [userData, setUserData] = useState<UserData | null>(null);
  const [activeSession, setActiveSession] = useState<GameSessionData | null>(null);
  const [gameHistory, setGameHistory] = useState<GameSessionData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync user to database when wallet connects
  const syncUserToDB = useCallback(async (walletAddress: Address) => {
    if (isSyncing || hasSyncedRef.current) return; // Prevent duplicate syncs

    try {
      setIsSyncing(true);
      setError(null);

      // Add timeout to prevent hanging
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), 10000)
      );

      // Sync user (ENS optional, will add later)
      const user = await Promise.race([
        syncUser(walletAddress, null),
        timeout
      ]) as UserData;
      setUserData(user);

      // Fetch active session and history in parallel (faster)
      const [session, history] = await Promise.all([
        getActiveSession(walletAddress),
        getUserGameHistory(walletAddress, 10)
      ]);

      setActiveSession(session);
      setGameHistory(history);

      hasSyncedRef.current = true;
      console.log('[UserSync] User synced:', user);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sync user';
      setError(errorMsg);
      console.error('[UserSync] Error:', err);

      // Still mark as synced to prevent infinite retries
      hasSyncedRef.current = true;
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Auto-sync when wallet connects
  useEffect(() => {
    if (isConnected && address && !hasSyncedRef.current) {
      syncUserToDB(address);
    } else if (!isConnected) {
      // Clear data on disconnect
      setUserData(null);
      setActiveSession(null);
      setGameHistory([]);
      hasSyncedRef.current = false;
    }
  }, [isConnected, address, syncUserToDB]);

  // Refresh user data
  const refreshUserData = useCallback(async () => {
    if (!address) return;

    try {
      setIsLoading(true);
      setError(null);

      const user = await getUserByAddress(address);
      if (user) {
        setUserData(user);
      }

      const session = await getActiveSession(address);
      setActiveSession(session);

      const history = await getUserGameHistory(address, 10);
      setGameHistory(history);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to refresh data';
      setError(errorMsg);
      console.error('[UserSync] Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  return {
    // User data
    userData,
    activeSession,
    gameHistory,
    virtualBalance: userData ? BigInt(userData.virtualBalance) : 0n,

    // Status
    isLoading,
    isSyncing,
    error,

    // Actions
    syncUserToDB,
    refreshUserData,
    setActiveSession,
  };
}
