'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useYellow } from '@/hooks/useYellow';
import { useNitroliteClient } from '@/hooks/useNitroliteClient';
import { useChannelLifecycle } from '@/hooks/useChannelLifecycle';
import { useDisconnect } from 'wagmi';
import { parseUSD, formatUSD } from '@/utils/tokenUtils';
import type { Hex } from 'viem';

type GameContextType = ReturnType<typeof useYellow> &
  ReturnType<typeof useChannelLifecycle> & {
  // Session state
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  depositAmount: string;
  setDepositAmount: (amount: string) => void;
  // Channel data
  channel: any;
  // App session
  appSessionId: Hex | null;
  // Game functions
  depositFunds: (amount: string) => Promise<void>;
  submitGameMove: (moveData: any, allocations: any[]) => Promise<void>;
  // User data
  virtualBalance: bigint;
  setVirtualBalance: React.Dispatch<React.SetStateAction<bigint>>;
  refreshUserData: () => Promise<void>;
  recordBetResult: (amount: bigint, multiplier: number, outcome: string) => Promise<void>;
  disconnectWallet: () => void;
  // Game stats
  totalWinnings: number;
  setTotalWinnings: React.Dispatch<React.SetStateAction<number>>;
  totalBets: number;
  setTotalBets: React.Dispatch<React.SetStateAction<number>>;
  // Messages
  messages: string[];
  error: string | null;
};

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const yellow = useYellow();
  const { nitroliteClient, address, ensureCorrectChain } = useNitroliteClient();
  const { disconnect } = useDisconnect();
  const channelLifecycle = useChannelLifecycle({
    yellow,
    nitroliteClient,
    address,
    ensureCorrectChain,
  });

  const [sessionActive, setSessionActive] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1.00');
  const [totalWinnings, setTotalWinnings] = useState(0);
  const [totalBets, setTotalBets] = useState(0);
  const [virtualBalance, setVirtualBalance] = useState(0n);
  const [channelData, setChannelData] = useState<any>(null);
  const [appSessionId, setAppSessionId] = useState<Hex | null>(null);
  const [brokerAddress, setBrokerAddress] = useState<string | null>(null);

  // Refresh channel data from blockchain
  const refreshChannelData = async () => {
    if (!channelLifecycle.channelId || !nitroliteClient) return;
    try {
      const data = await nitroliteClient.getChannelData(channelLifecycle.channelId);
      setChannelData(data);
      console.log('[GameContext] Channel data refreshed');
    } catch (err) {
      console.error('[GameContext] Failed to refresh channel data:', err);
    }
  };

  // Deposit funds to existing channel
  const depositFunds = async (amount: string) => {
    await channelLifecycle.addFunds(amount);
    await refreshChannelData();
    // Update virtual balance with new amount
    setVirtualBalance(prev => prev + parseUSD(amount));
  };

  // Submit game move via app session — matches app_session_two_signers.ts tutorial
  const submitGameMove = async (moveData: any, _newAllocations: any[]) => {
    const betAmount = parseUSD(String(moveData.betAmount || 0));
    if (betAmount > virtualBalance) throw new Error('Insufficient balance');

    if (appSessionId && address && brokerAddress) {
      // Submit state update via Yellow app session
      const newPlayerAmount = virtualBalance - betAmount;
      try {
        await yellow.submitAppState({
          appSessionId,
          allocations: [
            { participant: address, asset: 'usdc', amount: formatUSD(newPlayerAmount) },
            { participant: brokerAddress as `0x${string}`, asset: 'usdc', amount: formatUSD(betAmount) },
          ],
        });
      } catch (err) {
        console.error('[Game] App state update failed, continuing locally:', err);
      }
    }

    setVirtualBalance(prev => prev - betAmount);
    console.log('[Game] Bet placed:', moveData);
  };

  const refreshUserData = async () => {
    console.log('[Game] Refresh user data');
  };

  const recordBetResult = async (amount: bigint, multiplier: number, outcome: string) => {
    console.log('[Game] Record bet:', { amount, multiplier, outcome });
  };

  // Auto-fetch channel data when channelId changes
  useEffect(() => {
    if (channelLifecycle.channelId && nitroliteClient) {
      refreshChannelData();
    }
  }, [channelLifecycle.channelId, nitroliteClient]);

  // Fetch broker address and create app session when channel is ready + session is active
  useEffect(() => {
    const setupAppSession = async () => {
      if (
        !channelLifecycle.channelId ||
        !address ||
        !yellow.isAuthenticated ||
        !sessionActive ||
        appSessionId
      ) return;

      try {
        // Get broker address
        if (!brokerAddress) {
          console.log('[GameContext] Getting config...');
          const config = await yellow.getConfig();
          setBrokerAddress(config.brokerAddress);
          console.log('[GameContext] Broker:', config.brokerAddress?.slice(0, 10) + '...');
        }

        const broker = brokerAddress || (await yellow.getConfig()).brokerAddress;

        // Create app session with the deposited amount
        const amount = formatUSD(virtualBalance > 0n ? virtualBalance : parseUSD(depositAmount));
        console.log('[GameContext] Creating app session with', amount, 'USDC...');

        const response = await yellow.createAppSession({
          playerAddress: address,
          brokerAddress: broker as `0x${string}`,
          amount,
        });

        if (response?.appSessionId) {
          setAppSessionId(response.appSessionId as Hex);
          console.log('[GameContext] ✅ App session:', response.appSessionId.slice(0, 10) + '...');
        }
      } catch (err) {
        console.error('[GameContext] Failed to create app session:', err);
      }
    };

    setupAppSession();
  }, [channelLifecycle.channelId, address, yellow.isAuthenticated, sessionActive, appSessionId]);

  // Sync virtualBalance from deposit amount when session starts
  useEffect(() => {
    if (sessionActive && channelLifecycle.channelId && virtualBalance === 0n) {
      setVirtualBalance(parseUSD(depositAmount));
    }
  }, [sessionActive, channelLifecycle.channelId]);

  return (
    <GameContext.Provider
      value={{
        ...yellow,
        ...channelLifecycle,
        sessionActive,
        setSessionActive,
        depositAmount,
        setDepositAmount,
        channel: channelData,
        appSessionId,
        depositFunds,
        submitGameMove,
        virtualBalance,
        setVirtualBalance,
        refreshUserData,
        recordBetResult,
        disconnectWallet: disconnect,
        totalWinnings,
        setTotalWinnings,
        totalBets,
        setTotalBets,
        messages: [],
        error: null,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
}
