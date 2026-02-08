'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWalletClient, useAccount } from 'wagmi';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex, Address } from 'viem';
import { Client } from 'yellow-ts';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createGetConfigMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  RPCMethod,
  type RPCResponse,
  type AuthChallengeResponse,
} from '@erc7824/nitrolite';
import { base } from 'viem/chains';
import { BASE_MAINNET_USD_TOKEN } from '@/utils/yellowConstants';

const YELLOW_WS_URL = 'wss://clearnet.yellow.com/ws';
const SESSION_DURATION = 3600;
const APP_NAME = 'Omikuji';
const APP_SCOPE = 'omikuji.game';

// Module-level session key (persists across re-renders)
let moduleSessionKey: {
  privateKey: Hex;
  address: Address;
  signer: any;
} | null = null;

function ensureSessionKey() {
  if (!moduleSessionKey) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const signer = createECDSAMessageSigner(privateKey);
    moduleSessionKey = {
      privateKey,
      address: account.address,
      signer,
    };
    console.log('[Yellow] Session key:', moduleSessionKey.address.slice(0, 10) + '...');
  }
  return moduleSessionKey;
}

export function getSessionKey() {
  return ensureSessionKey();
}

export function useYellow() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const yellowRef = useRef<Client | null>(null);
  const sessionKeyRef = useRef(ensureSessionKey());
  const isAuthenticatedRef = useRef(false);

  // Store wallet client and address in refs so they're always available
  const walletClientRef = useRef(walletClient);
  const addressRef = useRef(address);

  // Update refs when values change
  useEffect(() => {
    walletClientRef.current = walletClient;
    addressRef.current = address;
  }, [walletClient, address]);

  // Response handlers for async operations
  const responseHandlersRef = useRef<Map<string, (data: any) => void>>(new Map());

  const log = useCallback((message: string) => {
    console.log(`[Yellow] ${message}`);
  }, []);

  // Connect to Yellow Network
  const connect = useCallback(async () => {
    if (yellowRef.current) {
      return;
    }

    const yellow = new Client({ url: YELLOW_WS_URL });
    yellowRef.current = yellow;

    await yellow.connect();
    setIsConnected(true);
    log('Connected');

    // Set up message listener
    yellow.listen(async (message: RPCResponse) => {
      const method = message.method;

      switch (method) {
        case RPCMethod.AuthChallenge:
          await handleAuthChallenge(message as AuthChallengeResponse);
          break;

        case RPCMethod.AuthVerify:
          if (message.params?.success !== false) {
            log('✅ Authenticated');
            setIsAuthenticated(true);
            isAuthenticatedRef.current = true;
            notifyHandler('authenticate', message.params);
          } else {
            notifyHandler('authenticate', null);
          }
          break;

        case RPCMethod.CreateChannel:
          log(`Channel created: ${message.params?.channel_id?.slice(0, 10)}...`);
          notifyHandler('createChannel', message.params);
          break;

        case RPCMethod.GetConfig:
          notifyHandler('getConfig', message.params);
          break;

        case RPCMethod.ResizeChannel:
          log('Channel resized');
          notifyHandler('resizeChannel', message.params);
          break;

        case RPCMethod.CloseChannel:
          log('Channel closed');
          notifyHandler('closeChannel', message.params);
          break;

        case RPCMethod.BalanceUpdate:
          log(`Balance update: ${message.params?.balance_updates?.length || 0} updates`);
          break;

        case RPCMethod.Error:
          console.error('[Yellow] Error:', message.params?.error);
          break;

        default:
          console.log('[Yellow] Unhandled:', method);
      }
    });
  }, [log]);

  // Handle auth challenge
  const handleAuthChallenge = useCallback(async (message: AuthChallengeResponse) => {
    const currentWalletClient = walletClientRef.current;
    const currentAddress = addressRef.current;

    if (!currentWalletClient || !currentAddress) {
      console.error('[Yellow] Cannot handle auth challenge: wallet not ready');
      return;
    }

    log('Signing auth challenge with MetaMask...');

    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);

    const authParams = {
      scope: APP_SCOPE,
      application: currentAddress,
      participant: sessionKeyRef.current.address,
      expire: sessionExpireTimestamp,
      allowances: [{ asset: 'usdc', amount: '1000' }],
      session_key: sessionKeyRef.current.address,
      expires_at: sessionExpireTimestamp,
    };

    const eip712Signer = createEIP712AuthMessageSigner(
      currentWalletClient,
      authParams,
      { name: APP_NAME }
    );

    const authVerifyMessage = await createAuthVerifyMessage(eip712Signer, message);
    yellowRef.current?.sendMessage(authVerifyMessage);
  }, [log]);

  // Notify waiting handlers
  const notifyHandler = useCallback((key: string, data: any) => {
    const handler = responseHandlersRef.current.get(key);
    if (handler) {
      handler(data);
      responseHandlersRef.current.delete(key);
    }
  }, []);

  // Wait for response
  const waitForResponse = useCallback((key: string, timeoutMs = 30000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        responseHandlersRef.current.delete(key);
        reject(new Error(`Timeout waiting for ${key}`));
      }, timeoutMs);

      responseHandlersRef.current.set(key, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }, []);

  // Authenticate
  const authenticate = useCallback(async () => {
    const currentAddress = addressRef.current;
    const currentWalletClient = walletClientRef.current;

    if (!currentAddress || !currentWalletClient || !yellowRef.current) {
      throw new Error('Wallet not ready or not connected to Yellow');
    }

    if (isAuthenticatedRef.current) {
      log('Already authenticated');
      return;
    }

    log('Authenticating...');

    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);

    const authMessage = await createAuthRequestMessage({
      address: currentAddress,
      session_key: sessionKeyRef.current.address,
      application: APP_NAME,
      allowances: [{ asset: 'usdc', amount: '1000' }],
      expires_at: sessionExpireTimestamp,
      scope: APP_SCOPE,
    });

    // Register handler BEFORE sending message to avoid race condition
    const authPromise = waitForResponse('authenticate', 30000);

    // Send auth message
    yellowRef.current.sendMessage(authMessage);

    // Wait for auth verification
    const authResult = await authPromise;
    if (!authResult) {
      throw new Error('Authentication failed');
    }

    log('Authentication complete');
  }, [log, waitForResponse]);

  // Create channel
  const createChannel = useCallback(async () => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    log('Creating channel...');

    const message = await createCreateChannelMessage(
      sessionKeyRef.current.signer,
      {
        chain_id: base.id,
        token: BASE_MAINNET_USD_TOKEN as Address,
      }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('createChannel');
  }, [log, waitForResponse]);

  // Get config (broker address, contract addresses)
  const getConfig = useCallback(async () => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    const message = await createGetConfigMessage(sessionKeyRef.current.signer);
    yellowRef.current.sendMessage(message);
    return waitForResponse('getConfig');
  }, [waitForResponse]);

  // Resize channel
  const resizeChannel = useCallback(async (params: {
    channelId: Hex;
    resizeAmount: bigint;
    allocateAmount: bigint;
    fundsDestination: Address;
  }) => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    log('Resizing channel...');

    const message = await createResizeChannelMessage(
      sessionKeyRef.current.signer,
      {
        channel_id: params.channelId,
        resize_amount: params.resizeAmount,
        allocate_amount: params.allocateAmount,
        funds_destination: params.fundsDestination,
      }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('resizeChannel');
  }, [log, waitForResponse]);

  // Close channel
  const closeChannel = useCallback(async (channelId: Hex, destination: Address) => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    log('Closing channel...');

    const message = await createCloseChannelMessage(
      sessionKeyRef.current.signer,
      {
        channel_id: channelId,
        funds_destination: destination,
      }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('closeChannel');
  }, [log, waitForResponse]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (yellowRef.current) {
      yellowRef.current.disconnect();
      yellowRef.current = null;
    }
    setIsConnected(false);
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    log('Disconnected');
  }, [log]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (yellowRef.current) {
        yellowRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    isAuthenticated,
    connect,
    disconnect,
    authenticate,
    createChannel,
    getConfig,
    resizeChannel,
    closeChannel,
  };
}
