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
  createAppSessionMessage,
  createSubmitAppStateMessage,
  createCloseAppSessionMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  RPCMethod,
  type RPCResponse,
  type AuthChallengeResponse,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  RPCProtocolVersion,
  type RPCData,
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

  // CRITICAL: Store expire timestamp in a ref so it's the SAME between
  // authenticate() and handleAuthChallenge() — computing it independently
  // in each function causes "invalid challenge or signature" errors
  const sessionExpireRef = useRef<bigint>(0n);

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
          log(`Channel response received`);
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

        case RPCMethod.CreateAppSession:
          log(`App session created: ${message.params?.appSessionId?.slice(0, 10)}...`);
          notifyHandler('createAppSession', message.params);
          break;

        case RPCMethod.SubmitAppState:
          log('App state updated');
          notifyHandler('submitAppState', message.params);
          break;

        case RPCMethod.CloseAppSession:
          log('App session closed');
          notifyHandler('closeAppSession', message.params);
          break;

        case RPCMethod.AppSessionUpdate:
          log('App session update (asu) received');
          break;

        case RPCMethod.Error:
          console.error('[Yellow] Error:', message.params?.error);
          // Reject ALL pending handlers so they don't timeout silently
          for (const [key, handler] of responseHandlersRef.current.entries()) {
            handler({ _error: true, error: message.params?.error });
          }
          responseHandlersRef.current.clear();
          break;

        default:
          console.log('[Yellow] Unhandled:', method, message.params);
      }
    });
  }, [log]);

  // Handle auth challenge — uses the SAME expire timestamp stored by authenticate()
  const handleAuthChallenge = useCallback(async (message: AuthChallengeResponse) => {
    const currentWalletClient = walletClientRef.current;
    const currentAddress = addressRef.current;

    if (!currentWalletClient || !currentAddress) {
      console.error('[Yellow] Cannot handle auth challenge: wallet not ready');
      return;
    }

    log('Signing auth challenge with MetaMask...');

    // Use the SAME expire timestamp that was stored by authenticate()
    // Matches create_channel.ts tutorial exactly
    const authParams = {
      scope: APP_SCOPE,
      application: currentAddress,
      participant: sessionKeyRef.current.address,
      expire: sessionExpireRef.current,
      allowances: [{ asset: 'usdc', amount: '1000' }],
      session_key: sessionKeyRef.current.address,
      expires_at: BigInt(sessionExpireRef.current),
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

  // Wait for response — rejects on error or timeout
  const waitForResponse = useCallback((key: string, timeoutMs = 30000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        responseHandlersRef.current.delete(key);
        reject(new Error(`Timeout waiting for ${key}`));
      }, timeoutMs);

      responseHandlersRef.current.set(key, (data) => {
        clearTimeout(timeout);
        if (data?._error) {
          reject(new Error(data.error || `Error in ${key}`));
        } else {
          resolve(data);
        }
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

    // Compute expire timestamp ONCE as BigInt and store it so handleAuthChallenge uses the same value
    // Matches create_channel.ts: const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);
    sessionExpireRef.current = sessionExpireTimestamp;

    // Matches create_channel.ts auth request exactly:
    //   application = app name string (NOT wallet address)
    //   expires_at = BigInt (NOT expire as String)
    const authMessage = await createAuthRequestMessage({
      address: currentAddress,
      session_key: sessionKeyRef.current.address,
      application: APP_NAME,
      allowances: [{ asset: 'usdc', amount: '1000' }],
      expires_at: BigInt(sessionExpireTimestamp),
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

  // Resize channel — matches resize_channel.ts tutorial:
  // Only include resize_amount / allocate_amount when they are defined (not 0n)
  const resizeChannel = useCallback(async (params: {
    channelId: Hex;
    resizeAmount?: bigint;
    allocateAmount?: bigint;
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
        ...(params.resizeAmount != null && params.resizeAmount !== 0n && { resize_amount: params.resizeAmount }),
        ...(params.allocateAmount != null && params.allocateAmount !== 0n && { allocate_amount: params.allocateAmount }),
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

  // Create app session — matches app_session_two_signers.ts tutorial
  const createAppSession = useCallback(async (params: {
    playerAddress: Address;
    brokerAddress: Address;
    amount: string;
  }) => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    log('Creating app session...');

    const appDefinition: RPCAppDefinition = {
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: [params.playerAddress, params.brokerAddress],
      weights: [50, 50],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
      application: APP_NAME,
    };

    const allocations: RPCAppSessionAllocation[] = [
      { participant: params.playerAddress, asset: 'usdc', amount: params.amount },
      { participant: params.brokerAddress, asset: 'usdc', amount: '0.00' },
    ];

    const message = await createAppSessionMessage(
      sessionKeyRef.current.signer,
      { definition: appDefinition, allocations }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('createAppSession');
  }, [log, waitForResponse]);

  // Submit app state update (game move)
  const submitAppState = useCallback(async (params: {
    appSessionId: Hex;
    allocations: RPCAppSessionAllocation[];
  }) => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    const message = await createSubmitAppStateMessage(
      sessionKeyRef.current.signer,
      { app_session_id: params.appSessionId, allocations: params.allocations }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('submitAppState');
  }, [waitForResponse]);

  // Close app session
  const closeAppSession = useCallback(async (params: {
    appSessionId: Hex;
    allocations: RPCAppSessionAllocation[];
  }) => {
    if (!isAuthenticatedRef.current || !yellowRef.current) {
      throw new Error('Not authenticated');
    }

    log('Closing app session...');

    const message = await createCloseAppSessionMessage(
      sessionKeyRef.current.signer,
      { app_session_id: params.appSessionId, allocations: params.allocations }
    );

    yellowRef.current.sendMessage(message);
    return waitForResponse('closeAppSession');
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
    createAppSession,
    submitAppState,
    closeAppSession,
    sessionKey: sessionKeyRef.current,
  };
}
