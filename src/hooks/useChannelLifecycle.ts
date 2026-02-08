'use client';

import { useState, useCallback } from 'react';
import { base } from 'wagmi/chains';
import { type Address, type Hex, parseUnits } from 'viem';
import { NitroliteClient } from '@erc7824/nitrolite';
import { BASE_MAINNET_USD_TOKEN } from '@/utils/yellowConstants';
import { basePublicClient } from '@/lib/viemClients';

interface YellowHook {
  isConnected: boolean;
  isAuthenticated: boolean;
  connect: () => Promise<void>;
  authenticate: () => Promise<void>;
  createChannel: () => Promise<any>;
  getConfig: () => Promise<any>;
  resizeChannel: (params: any) => Promise<any>;
  closeChannel: (channelId: Hex, destination: Address) => Promise<any>;
}

interface UseChannelLifecycleProps {
  yellow: YellowHook;
  nitroliteClient: NitroliteClient | null;
  address: Address | undefined;
  ensureCorrectChain: () => Promise<void>;
}

export function useChannelLifecycle({
  yellow,
  nitroliteClient,
  address,
  ensureCorrectChain,
}: UseChannelLifecycleProps) {
  const [channelId, setChannelId] = useState<Hex | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Create channel with deposit and resize
  const setupChannel = useCallback(async (depositAmount: string) => {
    if (!address || !nitroliteClient) {
      throw new Error('Wallet not connected');
    }

    setIsProcessing(true);

    try {
      await ensureCorrectChain();

      // Step 1: Connect and authenticate
      if (!yellow.isConnected) {
        console.log('[Channel] Connecting...');
        await yellow.connect();
      }

      if (!yellow.isAuthenticated) {
        console.log('[Channel] Authenticating...');
        await yellow.authenticate();
      }

      // Step 2: Create channel via clearnode
      console.log('[Channel] Creating channel...');
      const channelData = await yellow.createChannel();

      console.log('[Channel] Participants:', channelData.channel.participants);

      // Step 3: Submit channel to blockchain
      // Get channelId from nitroliteClient return value (matches create_channel.ts tutorial)
      console.log('[Channel] Submitting to blockchain...');
      const { channelId: createdChannelId, txHash } = await nitroliteClient.createChannel({
        channel: {
          ...channelData.channel,
          challenge: BigInt(channelData.channel.challenge),
          nonce: BigInt(channelData.channel.nonce),
        },
        unsignedInitialState: {
          intent: channelData.state.intent,
          version: BigInt(channelData.state.version),
          data: channelData.state.stateData || channelData.state.state_data || '0x',
          allocations: channelData.state.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
          })),
        },
        serverSignature: channelData.serverSignature || channelData.server_signature,
      });

      console.log('[Channel] Channel ID:', createdChannelId);
      console.log('[Channel] On-chain TX:', txHash?.slice(0, 10) + '...');
      setChannelId(createdChannelId);

      // Wait for create channel TX to be mined before deposit (prevents nonce collision)
      if (txHash) {
        console.log('[Channel] Waiting for create TX confirmation...');
        await basePublicClient.waitForTransactionReceipt({ hash: txHash });
        console.log('[Channel] Create TX confirmed');
      }

      // Step 4: Deposit to custody (if amount > 0)
      if (depositAmount && parseFloat(depositAmount) > 0) {
        console.log(`[Channel] Depositing ${depositAmount} USDC...`);

        const amountInUnits = parseUnits(depositAmount, 6);
        const depositTxHash = await nitroliteClient.deposit(
          BASE_MAINNET_USD_TOKEN,
          amountInUnits
        );

        console.log('[Channel] Deposit TX:', depositTxHash?.slice(0, 10) + '...');

        // Wait for deposit TX to be mined before resize (prevents nonce collision)
        if (depositTxHash) {
          console.log('[Channel] Waiting for deposit TX confirmation...');
          await basePublicClient.waitForTransactionReceipt({ hash: depositTxHash });
          console.log('[Channel] Deposit TX confirmed');
        }

        // Step 5: Resize + Allocate (custody → channel → unified balance)
        // Matches resize_channel.ts tutorial: funds_destination = brokerAddress when allocating
        console.log('[Channel] Getting broker address...');
        const config = await yellow.getConfig();
        const brokerAddress = config.brokerAddress as Address;
        console.log('[Channel] Broker:', brokerAddress.slice(0, 10) + '...');

        console.log('[Channel] Resizing + allocating to unified balance...');
        const resizeData = await yellow.resizeChannel({
          channelId: createdChannelId,
          resizeAmount: amountInUnits,
          allocateAmount: amountInUnits,
          fundsDestination: brokerAddress,
        });

        // Submit resize to blockchain
        const previousChannelData = await nitroliteClient.getChannelData(createdChannelId);

        await nitroliteClient.resizeChannel({
          resizeState: {
            channelId: createdChannelId,
            intent: resizeData.state.intent,
            version: BigInt(resizeData.state.version),
            data: resizeData.state.stateData || resizeData.state.state_data || '0x',
            allocations: resizeData.state.allocations.map((a: any) => ({
              destination: a.destination,
              token: a.token,
              amount: BigInt(a.amount),
            })),
            serverSignature: resizeData.serverSignature || resizeData.server_signature,
          },
          proofStates: [previousChannelData.lastValidState],
        });

        console.log('[Channel] ✅ Channel ready — funds in unified balance');
      }

      return { channelId: createdChannelId, txHash };
    } catch (err) {
      console.error('[Channel] Setup error:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [yellow, nitroliteClient, address, ensureCorrectChain]);

  // Add funds to an existing channel (deposit + resize)
  const addFunds = useCallback(async (depositAmount: string) => {
    if (!channelId || !address || !nitroliteClient) {
      throw new Error('No channel to add funds to');
    }

    setIsProcessing(true);

    try {
      await ensureCorrectChain();

      const amountInUnits = parseUnits(depositAmount, 6);

      // Step 1: Deposit USDC to custody
      console.log(`[Channel] Depositing ${depositAmount} USDC...`);
      const depositTxHash = await nitroliteClient.deposit(
        BASE_MAINNET_USD_TOKEN,
        amountInUnits
      );
      console.log('[Channel] Deposit TX:', depositTxHash?.slice(0, 10) + '...');

      // Wait for deposit TX to be mined before resize
      if (depositTxHash) {
        console.log('[Channel] Waiting for deposit TX confirmation...');
        await basePublicClient.waitForTransactionReceipt({ hash: depositTxHash });
        console.log('[Channel] Deposit TX confirmed');
      }

      // Step 2: Resize + Allocate (custody → channel → unified balance)
      console.log('[Channel] Getting broker address...');
      const config = await yellow.getConfig();
      const brokerAddress = config.brokerAddress as Address;

      console.log('[Channel] Resizing + allocating to unified balance...');
      const resizeData = await yellow.resizeChannel({
        channelId,
        resizeAmount: amountInUnits,
        allocateAmount: amountInUnits,
        fundsDestination: brokerAddress,
      });

      const previousChannelData = await nitroliteClient.getChannelData(channelId);

      await nitroliteClient.resizeChannel({
        resizeState: {
          channelId,
          intent: resizeData.state.intent,
          version: BigInt(resizeData.state.version),
          data: resizeData.state.stateData || resizeData.state.state_data || '0x',
          allocations: resizeData.state.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
          })),
          serverSignature: resizeData.serverSignature || resizeData.server_signature,
        },
        proofStates: [previousChannelData.lastValidState],
      });

      console.log('[Channel] ✅ Funds added to unified balance');
    } catch (err) {
      console.error('[Channel] Add funds error:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [yellow, nitroliteClient, channelId, address, ensureCorrectChain]);

  // Close channel
  const closeChannel = useCallback(async () => {
    if (!channelId || !address || !nitroliteClient) {
      throw new Error('No channel to close');
    }

    setIsProcessing(true);

    try {
      await ensureCorrectChain();

      console.log('[Channel] Closing...');

      const closeData = await yellow.closeChannel(channelId, address);

      const channelData = await nitroliteClient.getChannelData(channelId);

      const closeTxResult = await nitroliteClient.closeChannel({
        stateData: closeData.state.stateData || closeData.state.state_data || '0x',
        finalState: {
          channelId,
          intent: closeData.state.intent,
          version: BigInt(closeData.state.version),
          data: closeData.state.stateData || closeData.state.state_data || '0x',
          allocations: closeData.state.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
          })),
          serverSignature: closeData.serverSignature || closeData.server_signature,
        },
        proofStates: [channelData.lastValidState],
      });

      console.log('[Channel] ✅ Closed');
      setChannelId(null);

      return closeTxResult;
    } catch (err) {
      console.error('[Channel] Close error:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [yellow, nitroliteClient, channelId, address, ensureCorrectChain]);

  return {
    channelId,
    isProcessing,
    setupChannel,
    addFunds,
    closeChannel,
  };
}
