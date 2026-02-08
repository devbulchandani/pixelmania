'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AssetSymbol, getPythId } from '@/lib/constants';
import { getCurrentPrice } from '@/lib/pythService';
import GameCanvas from './canvasui';

// --- CONSTANTS FOR GRID SNAPPING ---
const GRID_TIME_STEP = 2500;
const GRID_PRICE_ROWS = 8;
const BETTING_COLUMNS = 12;
const BETTING_AREA_PERCENT = 0.75;
const LOCK_ZONE_MS = 20_000; // 20-second time-lock boundary

export interface TargetBlock {
  id: string;
  targetPrice: number;
  amount: number;
  multiplier: number;
  expiryTime: number;
  isUpward: boolean;
  status: 'PENDING' | 'HIT' | 'MISSED';
  createdAt: number;
  hitTime?: number;
}

export interface Viewport {
  timeOffset: number;
  priceOffset: number;
  zoom: number;
}

interface GameEngineProps {
  selectedAsset: AssetSymbol;
  userAddress?: string;
  selectedAmount: number;
  onPlaceBetAPI: (targetPrice: number, amount: number, multiplier: number) => Promise<void>;
  onPriceUpdate?: (price: number) => void;
  onBlocksUpdate?: (blocks: TargetBlock[]) => void;
  confirmedCells?: Set<string>;
  pendingCells?: Set<string>;
}

export default function GameEngine({
  selectedAsset,
  userAddress,
  selectedAmount,
  onPlaceBetAPI,
  onPriceUpdate,
  onBlocksUpdate,
  confirmedCells,
  pendingCells,
}: GameEngineProps) {

  // --- STATE ---
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ time: number; price: number }[]>([]);
  const [blocks, setBlocks] = useState<TargetBlock[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);

  // --- ELASTIC Y-AXIS (Price Centering) ---
  // viewportCenterPrice is the price at the center of the Y-axis.
  // It stays FIXED until the laser (currentPrice) drifts beyond ±30% of canvas
  // height from center, then smoothly lerps to re-center over ~1.5 seconds.
  const vcRef = useRef<number | null>(null);      // mutable for animation frame
  const recenterRef = useRef(false);               // is currently re-centering?
  const [viewportCenterPrice, setViewportCenterPrice] = useState<number | null>(null);

  const [viewport, setViewport] = useState<Viewport>({
    timeOffset: 0,
    priceOffset: 0,
    zoom: 1,
  });

  // Elastic re-center loop (runs every frame at 60fps)
  useEffect(() => {
    let id: number;
    let running = true;

    const tick = () => {
      if (!running) return;
      const live = currentPrice;
      if (live !== null) {
        if (vcRef.current === null) {
          // First price — snap
          vcRef.current = live;
          setViewportCenterPrice(live);
        } else {
          const center = vcRef.current;
          const spread = 2 * viewport.zoom; // ±$2 fixed range
          const range = spread * 2;
          // priceRatio: 0 = bottom of view, 1 = top, 0.5 = center
          const priceRatio = (live - (center - spread)) / range;

          // Trigger re-center when laser goes beyond ±30% from center
          if (priceRatio < 0.2 || priceRatio > 0.8) {
            recenterRef.current = true;
          }

          if (recenterRef.current) {
            // Lerp: alpha ≈0.035/frame → 95% close in ~1.5s at 60fps
            const alpha = 0.035;
            const next = center + (live - center) * alpha;
            vcRef.current = next;
            setViewportCenterPrice(next);

            // Stop when back within ±10% of center
            const newSpread = next * 0.01 * viewport.zoom;
            const newRange = newSpread * 2;
            const newRatio = (live - (next - newSpread)) / newRange;
            if (newRatio > 0.4 && newRatio < 0.6) {
              recenterRef.current = false;
            }
          }
        }
      }
      id = requestAnimationFrame(tick);
    };

    id = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(id); };
  }, [currentPrice, viewport.zoom]);

  // --- DATA FETCHING ---
  useEffect(() => {
    let mounted = true;

    const fetchPrice = async () => {
      try {
        const priceId = getPythId(selectedAsset);
        const newPrice = await getCurrentPrice(priceId);
        if (!mounted) return;

        setCurrentPrice(newPrice);
        onPriceUpdate?.(newPrice);

        setPriceHistory(prev => {
          const now = Date.now();
          const newPoint = { time: now, price: newPrice };
          const cutoff = now - 60_000;
          return [...prev.filter(p => p.time > cutoff), newPoint];
        });
      } catch (e) {
        console.error('[Pyth] Error:', e);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, [selectedAsset, onPriceUpdate]);

  // --- VISIBLE BOUNDS ---
  const getVisibleBounds = useMemo(() => {
    const center = viewportCenterPrice ?? currentPrice;
    if (!center) return { min: 0, max: 100, range: 100 };

    const spread = 2 * viewport.zoom; // ±$2 fixed range
    const cp = center + viewport.priceOffset;

    return { min: cp - spread, max: cp + spread, range: spread * 2 };
  }, [currentPrice, viewportCenterPrice, viewport]);

  // --- WIN / LOSS: Collision check ---
  // When laser-X overlaps a cell's time column AND laser-Y (currentPrice)
  // is within the cell's price row → HIT.
  useEffect(() => {
    if (!currentPrice) return;
    const now = Date.now();
    const priceStep = getVisibleBounds.range / GRID_PRICE_ROWS;

    setBlocks(prev => prev.map(block => {
      if (block.status !== 'PENDING') return block;

      const gridT = Math.floor(block.expiryTime / GRID_TIME_STEP) * GRID_TIME_STEP;
      const gridTEnd = gridT + GRID_TIME_STEP;

      // Laser X overlaps this cell's column?
      const timeOverlap = now >= gridT && now <= gridTEnd;

      // Laser Y within cell's price band?
      const halfStep = priceStep / 2;
      const priceInRange =
        currentPrice >= block.targetPrice - halfStep &&
        currentPrice <= block.targetPrice + halfStep;

      if (timeOverlap && priceInRange) {
        return { ...block, status: 'HIT', hitTime: Date.now() };
      }
      if (now > gridTEnd) {
        return { ...block, status: 'MISSED' };
      }
      return block;
    }));
  }, [currentPrice, getVisibleBounds]);

  // Notify parent of block changes (separate effect to avoid setState during render)
  useEffect(() => {
    if (onBlocksUpdate) {
      onBlocksUpdate(blocks);
    }
  }, [blocks, onBlocksUpdate]);

  // --- PAN ---
  const handlePan = useCallback((deltaX: number, deltaY: number, width: number, height: number) => {
    setViewport(prev => {
      const bettingW = width * BETTING_AREA_PERCENT;
      const bettingDur = BETTING_COLUMNS * GRID_TIME_STEP;
      const msPerPx = bettingDur / bettingW;
      const pricePP = (currentPrice || 1000) * 0.00002 * prev.zoom;

      let newTO = prev.timeOffset - (deltaX * msPerPx);
      newTO = Math.max(0, newTO);

      return {
        ...prev,
        timeOffset: newTO,
        priceOffset: prev.priceOffset + (deltaY * pricePP),
      };
    });
  }, [currentPrice]);

  // --- PLACE BET ---
  const handlePlaceBet = useCallback(async (screenX: number, screenY: number, width: number, height: number) => {
    if (!currentPrice || isPlacing) return;

    const { min, range } = getVisibleBounds;
    const priceStep = range / GRID_PRICE_ROWS;

    const priceRatio = (height - screenY) / height;
    const rawPrice = min + (priceRatio * range);
    const rowIdx = Math.floor((rawPrice - min) / priceStep);
    const snappedPrice = min + (rowIdx * priceStep) + (priceStep / 2);

    const now = Date.now();
    const bettingW = width * BETTING_AREA_PERCENT;
    const bettingDur = BETTING_COLUMNS * GRID_TIME_STEP;
    const nowLineX = width - bettingW;
    const pxPerMs = bettingW / bettingDur;
    const msPerPx = 1 / pxPerMs;

    const clickTime = now + ((screenX - nowLineX) * msPerPx) - viewport.timeOffset;
    const snappedTime = Math.floor(clickTime / GRID_TIME_STEP) * GRID_TIME_STEP;

    // --- TIME-LOCK: reject if within 20s boundary ---
    if (snappedTime < now + LOCK_ZONE_MS) {
      console.warn('[GameEngine] Bet rejected: inside 20s lock zone');
      return;
    }

    const diff = Math.abs(snappedPrice - currentPrice);
    const bps = (diff * 10000) / currentPrice;
    const bonus = (bps * 2000) / 1000;
    let multiplier = (110 + bonus) / 100;
    multiplier = Math.min(Math.max(multiplier, 1.1), 50.0);

    const isUpward = snappedPrice > currentPrice;

    const newBlock: TargetBlock = {
      id: Date.now().toString(),
      targetPrice: snappedPrice,
      amount: selectedAmount,
      multiplier,
      expiryTime: snappedTime,
      isUpward,
      status: 'PENDING',
      createdAt: Date.now(),
    };

    setBlocks(prev => [...prev, newBlock]);
    setIsPlacing(true);

    try {
      await onPlaceBetAPI(snappedPrice, selectedAmount, multiplier);
    } finally {
      setIsPlacing(false);
    }
  }, [currentPrice, getVisibleBounds, isPlacing, selectedAmount, onPlaceBetAPI, viewport]);

  return (
    <div className="relative w-full h-full bg-[#121212] overflow-hidden">
      <GameCanvas
        currentPrice={currentPrice}
        priceHistory={priceHistory}
        blocks={blocks}
        selectedAsset={selectedAsset}
        viewport={viewport}
        visibleBounds={getVisibleBounds}
        viewportCenterPrice={viewportCenterPrice}
        onPan={handlePan}
        onPlaceBet={handlePlaceBet}
        confirmedCells={confirmedCells}
        pendingCells={pendingCells}
      />
    </div>
  );
}
