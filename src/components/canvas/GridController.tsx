'use client';

import { useState, useCallback } from 'react';
import type { Address } from 'viem';
import { getPythId, type AssetSymbol } from '@/lib/constants';
import { parseUSD } from '@/utils/tokenUtils';
import type { GameMoveData, AppSessionAllocation } from '@/utils/yellowTypes';

interface UseGridControllerProps {
  submitGameMove: (moveData: GameMoveData, newAllocations: AppSessionAllocation[]) => Promise<any>;
  virtualBalance: bigint;
  selectedAsset: AssetSymbol;
  currentPrice: number | null;
  playerAddress: Address | undefined;
}

export function useGridController({
  submitGameMove,
  virtualBalance,
  selectedAsset,
  currentPrice,
  playerAddress,
}: UseGridControllerProps) {
  const [confirmedCells, setConfirmedCells] = useState<Set<string>>(new Set());
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

  const handleCellClick = useCallback(async (
    cellId: string,
    targetPrice: number,
    betAmount: number,
    multiplier: number,
  ) => {
    if (!playerAddress || !currentPrice) {
      throw new Error('Player address or current price not available');
    }

    const betInUnits = parseUSD(betAmount.toString());
    if (betInUnits > virtualBalance) {
      throw new Error('Insufficient balance');
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

    const newAllocations: AppSessionAllocation[] = [];

    // Mark cell as pending
    setPendingCells(prev => new Set(prev).add(cellId));

    try {
      await submitGameMove(moveData, newAllocations);
      // Move from pending to confirmed immediately (no ASU notification)
      setPendingCells(prev => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
      setConfirmedCells(prev => new Set(prev).add(cellId));
      console.log(`Cell ${cellId} confirmed (Mint Green #B2FF9E)`);
    } catch (err) {
      // Remove from pending on failure
      setPendingCells(prev => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
      throw err;
    }
  }, [virtualBalance, playerAddress, currentPrice, selectedAsset, submitGameMove]);

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
