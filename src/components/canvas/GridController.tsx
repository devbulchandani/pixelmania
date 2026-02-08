'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { getPythId, type AssetSymbol } from '@/lib/constants';
import { parseUSD } from '@/utils/tokenUtils';
import { BASE_MAINNET_USD_TOKEN } from '@/utils/yellowConstants';
import type { GameMoveData, AppSessionAllocation, GameAppSession } from '@/utils/yellowTypes';

interface UseGridControllerProps {
  submitGameMove: (moveData: GameMoveData, newAllocations: AppSessionAllocation[]) => Promise<any>;
  appSession: GameAppSession | null;
  yellowSession: {
    subscribe: (listener: (method: string, params: any) => void) => () => void;
  };
  selectedAsset: AssetSymbol;
  currentPrice: number | null;
  playerAddress: Address | undefined;
}

export function useGridController({
  submitGameMove,
  appSession,
  yellowSession,
  selectedAsset,
  currentPrice,
  playerAddress,
}: UseGridControllerProps) {
  const [confirmedCells, setConfirmedCells] = useState<Set<string>>(new Set());
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

  // Subscribe to asu notifications to mark cells as confirmed
  useEffect(() => {
    const unsubscribe = yellowSession.subscribe((method, params) => {
      if (method !== 'asu') return;

      try {
        const sessionData = params?.session_data || params?.sessionData;
        if (!sessionData) return;

        const moveData: GameMoveData = JSON.parse(sessionData);
        if (moveData.cellId) {
          setPendingCells(prev => {
            const next = new Set(prev);
            next.delete(moveData.cellId);
            return next;
          });
          setConfirmedCells(prev => new Set(prev).add(moveData.cellId));
          console.log(`Cell ${moveData.cellId} confirmed (Mint Green #B2FF9E)`);
        }
      } catch {
        // Ignore parse errors from non-game asu notifications
      }
    });

    return unsubscribe;
  }, [yellowSession]);

  const handleCellClick = useCallback(async (
    cellId: string,
    targetPrice: number,
    betAmount: number,
    multiplier: number,
  ) => {
    if (!appSession || !playerAddress || !currentPrice) {
      throw new Error('App session, player address, or current price not available');
    }

    const pythPriceId = getPythId(selectedAsset);

    const moveData: GameMoveData = {
      cellId,
      targetPrice,
      betAmount,
      multiplier,
      pythPriceId,
      timestamp: Date.now(),
    };

    // Calculate new allocations: player loses bet, clearnode gains bet
    const betInUnits = parseUSD(betAmount.toString());
    const currentPlayerAmount = BigInt(appSession.allocations[0]?.amount || '0');
    const currentClearnodeAmount = BigInt(appSession.allocations[1]?.amount || '0');

    if (currentPlayerAmount < betInUnits) {
      throw new Error('Insufficient balance in app session');
    }

    const newAllocations: AppSessionAllocation[] = [
      {
        asset: BASE_MAINNET_USD_TOKEN,
        amount: (currentPlayerAmount - betInUnits).toString(),
        participant: appSession.participants[0],
      },
      {
        asset: BASE_MAINNET_USD_TOKEN,
        amount: (currentClearnodeAmount + betInUnits).toString(),
        participant: appSession.participants[1],
      },
    ];

    // Mark cell as pending
    setPendingCells(prev => new Set(prev).add(cellId));

    try {
      await submitGameMove(moveData, newAllocations);
    } catch (err) {
      // Remove from pending on failure
      setPendingCells(prev => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
      throw err;
    }
  }, [appSession, playerAddress, currentPrice, selectedAsset, submitGameMove]);

  const isCellConfirmed = useCallback((cellId: string) => confirmedCells.has(cellId), [confirmedCells]);
  const isCellPending = useCallback((cellId: string) => pendingCells.has(cellId), [pendingCells]);

  return {
    handleCellClick,
    confirmedCells,
    pendingCells,
    isCellConfirmed,
    isCellPending,
  };
}
