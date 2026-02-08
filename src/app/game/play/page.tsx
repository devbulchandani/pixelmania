'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/contexts/GameContext';
import { useGridController } from '@/components/canvas/GridController';
import GameEngine from '@/components/canvas/GameEngine';
import { AssetSymbol } from '@/lib/constants';
import { formatUSD, parseUSD } from '@/utils/tokenUtils';
import Navbar from '@/components/game/Navbar';
import ActivityLog from '@/components/game/ActivityLog';

export default function GamePlayPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const {
    channel, isProcessing, closeChannel, depositFunds, messages, error,
    submitGameMove, virtualBalance, appSessionId, closeAppSession,
    sessionActive, setSessionActive,
    totalWinnings, setTotalWinnings, totalBets, setTotalBets,
    recordBetResult, refreshUserData, disconnectWallet,
  } = useGameContext();

  const [selectedAsset] = useState<AssetSymbol>('ETH');
  const [betAmount, setBetAmount] = useState(1);
  const [customBetAmount, setCustomBetAmount] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

  const gridController = useGridController({
    submitGameMove, virtualBalance, selectedAsset, currentPrice, playerAddress: address,
  });

  useEffect(() => { if (!isConnected) router.push('/'); }, [isConnected, router]);
  useEffect(() => { if (!sessionActive) router.push('/game'); }, [sessionActive, router]);

  // Track block status changes and record outcomes
  useEffect(() => {
    const processBlocks = async () => {
      for (const block of blocks) {
        if (block.status === 'HIT' || block.status === 'MISSED') {
          const alreadyRecorded = block._recorded;
          if (alreadyRecorded) continue;

          const outcome = block.status === 'HIT' ? 'WIN' : 'LOSS';
          try {
            await recordBetResult(parseUSD(block.amount.toString()), block.multiplier, outcome);
            setTotalBets(prev => prev + 1);
            if (outcome === 'WIN') {
              setTotalWinnings(prev => prev + (block.amount * block.multiplier - block.amount));
            }
            setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, _recorded: true } : b));
          } catch (err) {
            console.error('Failed to record bet result:', err);
          }
        }
      }
    };

    processBlocks();
  }, [blocks, recordBetResult, setTotalBets, setTotalWinnings]);

  const endSession = async () => {
    if (!channel) return;
    try {
      // Close app session before closing channel (if one exists)
      if (appSessionId) {
        try {
          await closeAppSession({
            appSessionId,
            allocations: [], // final allocations
          });
        } catch (err) {
          console.error('Failed to close app session:', err);
        }
      }
      await closeChannel();
      setSessionActive(false);
      setTotalBets(0);
      setTotalWinnings(0);
      await refreshUserData();
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const addFunds = async () => {
    const amount = prompt('Enter amount to deposit (USD):');
    if (amount) { try { await depositFunds(amount); } catch {} }
  };

  const handlePlaceBet = async (targetPrice: number, amount: number, multiplier: number) => {
    if (!channel || !address) { alert('Start a session first!'); return; }
    try {
      await gridController.handleCellClick(`${targetPrice.toFixed(2)}_${Date.now()}`, targetPrice, amount, multiplier);
    } catch (err) {
      console.error('Failed to place bet:', err);
      throw err;
    }
  };

  if (!isConnected || !address || !sessionActive) return null;

  // Wait for channel instead of appSession
  if (!channel) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Channel Required</h1>
          <p className="text-muted mb-6">Please return to session setup and create a channel</p>
          <button onClick={() => { setSessionActive(false); router.push('/game'); }} className="btn-primary">
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  const channelBalance = channel?.lastValidState?.allocations?.[0]?.amount
    ? formatUSD(BigInt(channel.lastValidState.allocations[0].amount))
    : '0.00';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar
        address={address}
        status="live"
        dbBalance={formatUSD(virtualBalance)}
        channelBalance={channelBalance}
        totalBets={totalBets}
        isProcessing={isProcessing}
        onEndSession={endSession}
        onLogoClick={() => { setSessionActive(false); router.push('/game'); }}
        onDisconnect={disconnectWallet}
      />

      <div className="relative">
        {/* Price Ticker */}
        {currentPrice && (
          <div className="glass-card absolute top-6 left-6 z-10 p-4 rounded-2xl">
            <div className="label-xs mb-1">LIVE PRICE</div>
            <div className="text-3xl font-bold text-mint tracking-tight">
              ${currentPrice.toFixed(2)}
            </div>
            <div className="text-xs text-muted/50 mt-1">{selectedAsset}/USD</div>
          </div>
        )}

        {/* Canvas */}
        <div className="w-full h-[70vh] relative border-b border-border">
          <GameEngine
            selectedAsset={selectedAsset}
            userAddress={address}
            selectedAmount={betAmount}
            onPlaceBetAPI={handlePlaceBet}
            onPriceUpdate={setCurrentPrice}
            onBlocksUpdate={setBlocks}
            confirmedCells={gridController.confirmedCells}
            pendingCells={gridController.pendingCells}
          />
        </div>

        {/* Control Panel */}
        <div className="py-8">
          <div className="max-w-[1400px] mx-auto px-8">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
              {/* Bet Amount */}
              <div className="card-section">
                <div className="label-xs mb-4">BET AMOUNT ($USD)</div>
                {!showCustomInput ? (
                  <>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[0.01, 0.1, 1, 5].map(amount => (
                        <button
                          key={amount}
                          onClick={() => { setBetAmount(amount); setCustomBetAmount(''); }}
                          className={`bet-btn ${betAmount === amount ? 'bet-btn--active' : 'bet-btn--inactive'}`}
                        >
                          ${amount}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowCustomInput(true)}
                      className="w-full p-2 text-xs text-muted underline cursor-pointer bg-transparent border-none"
                    >
                      Custom amount
                    </button>
                  </>
                ) : (
                  <div>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={customBetAmount}
                      onChange={(e) => {
                        setCustomBetAmount(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) setBetAmount(val);
                      }}
                      placeholder="0.0001"
                      className="input-field mb-2"
                      style={{ fontSize: '16px', padding: '12px' }}
                    />
                    <button
                      onClick={() => { setShowCustomInput(false); setCustomBetAmount(''); }}
                      className="w-full p-2 text-xs text-muted underline cursor-pointer bg-transparent border-none"
                    >
                      Use presets
                    </button>
                  </div>
                )}
              </div>

              {/* Add Funds */}
              <div className="card-section">
                <div className="label-xs mb-4">ACCOUNT</div>
                <button onClick={addFunds} disabled={isProcessing} className="btn-primary">
                  ADD FUNDS
                </button>
              </div>

              {/* End Session */}
              <div className="card-section-danger">
                <div className="label-xs text-danger mb-4">SESSION</div>
                <button onClick={endSession} disabled={isProcessing} className="btn-danger">
                  END SESSION
                </button>
              </div>
            </div>

            <div className="info-box mt-6">
              <div className="label-xs text-mint mb-3">HOW TO PLAY</div>
              <div className="text-sm text-muted leading-relaxed space-y-2">
                <p>Click on a grid block to place your bet at that price multiplier</p>
                <p>Green burst = WIN | Red shatter = LOSS</p>
                <p>Right-click + drag to pan the chart</p>
                <p>All bets use Yellow Network app sessions (instant, gas-free)</p>
              </div>
            </div>
          </div>
        </div>

        <ActivityLog messages={messages} />
        {error && <div className="toast-error">{error}</div>}
      </div>
    </div>
  );
}
