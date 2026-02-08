/**
 * Manual script to close a stuck channel
 * Run with: npx tsx close-channel-manual.ts
 */

import { createWalletClient, createPublicClient, http, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Client } from 'yellow-ts';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createCloseChannelMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  NitroliteClient,
  WalletStateSigner,
  RPCMethod,
  type RPCResponse,
  type AuthChallengeResponse,
} from '@erc7824/nitrolite';
import * as readline from 'readline';

const YELLOW_WS_URL = 'wss://clearnet.yellow.com/ws';
const CUSTODY_ADDRESS = '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6' as Address;
const ADJUDICATOR_ADDRESS = '0x7de4A0736Cf5740fD3Ca2F2e9cc85c9AC223eF0C' as Address;
const STUCK_CHANNEL_ID = '0xc3f651a690c679f51dd480984d25a0bd8cb27122790f7708d823af6ea1bbec40' as Hex;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('🔧 Manual Channel Closer\n');
  console.log('Channel to close:', STUCK_CHANNEL_ID);
  console.log('');

  // Get private key from user
  const privateKey = "";

  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format');
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Wallet address:', account.address);
  console.log('');

  

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  // Connect to Yellow
  console.log('\n🔌 Connecting to Yellow Network...');
  const yellow = new Client({ url: YELLOW_WS_URL });
  await yellow.connect();
  console.log('✅ Connected');

  // Generate session key (MUST be different from wallet!)
  console.log('🔑 Generating session key...');
  const sessionPrivateKey = generatePrivateKey();
  const sessionKey = privateKeyToAccount(sessionPrivateKey);
  const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
  console.log('Session key address:', sessionKey.address);

  let isAuthenticated = false;
  let closeChannelData: any = null;

  // Set up message listener
  yellow.listen(async (message: RPCResponse) => {
    switch (message.method) {
      case RPCMethod.AuthChallenge:
        console.log('🔐 Handling auth challenge...');
        const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const authParams = {
          scope: 'omikuji.close',
          application: account.address,
          participant: sessionKey.address,
          expire: sessionExpireTimestamp,
          allowances: [{ asset: 'usdc', amount: '1000' }],
          session_key: sessionKey.address,
          expires_at: sessionExpireTimestamp,
        };

        const eip712Signer = createEIP712AuthMessageSigner(
          walletClient,
          authParams,
          { name: 'Channel Closer' }
        );

        const authVerifyMessage = await createAuthVerifyMessage(
          eip712Signer,
          message as AuthChallengeResponse
        );
        yellow.sendMessage(authVerifyMessage);
        break;

      case RPCMethod.AuthVerify:
        if (message.params?.success !== false) {
          console.log('✅ Authenticated\n');
          isAuthenticated = true;

          // Request to close the channel
          console.log('📤 Requesting channel closure...');
          const closeMessage = await createCloseChannelMessage(
            sessionSigner,
            STUCK_CHANNEL_ID,
            account.address
          );
          yellow.sendMessage(closeMessage);
        } else {
          console.error('❌ Authentication failed');
          await yellow.disconnect();
          rl.close();
        }
        break;

      case RPCMethod.CloseChannel:
        console.log('✅ Close channel data received from clearnode\n');
        closeChannelData = message.params;

        // Now submit to blockchain
        console.log('📤 Submitting close transaction to blockchain...');

        const nitroliteClient = new NitroliteClient({
          walletClient: walletClient as any,
          publicClient: publicClient as any,
          stateSigner: new WalletStateSigner(walletClient),
          addresses: {
            custody: CUSTODY_ADDRESS,
            adjudicator: ADJUDICATOR_ADDRESS,
          },
          chainId: base.id,
          challengeDuration: 3600n,
        });

        try {
          const channelData = await nitroliteClient.getChannelData(STUCK_CHANNEL_ID);

          const closeTxResult = await nitroliteClient.closeChannel({
            stateData: closeChannelData.state.stateData || closeChannelData.state.state_data || '0x',
            finalState: {
              channelId: STUCK_CHANNEL_ID,
              intent: closeChannelData.state.intent,
              version: BigInt(closeChannelData.state.version),
              data: closeChannelData.state.stateData || closeChannelData.state.state_data || '0x',
              allocations: closeChannelData.state.allocations.map((a: any) => ({
                destination: a.destination,
                token: a.token,
                amount: BigInt(a.amount),
              })),
              serverSignature: closeChannelData.serverSignature || closeChannelData.server_signature,
            },
            proofStates: [channelData.lastValidState],
          });

          console.log('✅ Channel closed!');
          console.log('TX Hash:', closeTxResult);
          console.log('\nWaiting for confirmation...');

          await publicClient.waitForTransactionReceipt({ hash: closeTxResult });
          console.log('✅ Transaction confirmed!\n');
          console.log('You can now create a new channel.');
        } catch (err) {
          console.error('❌ Close failed:', err);
        }

        await yellow.disconnect();
        rl.close();
        break;

      case RPCMethod.Error:
        console.error('❌ Yellow Error:', message.params);
        await yellow.disconnect();
        rl.close();
        break;
    }
  });

  // Start authentication
  console.log('🔐 Authenticating...');
  const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const authMessage = await createAuthRequestMessage({
    address: account.address,
    session_key: sessionKey.address,
    application: 'Channel Closer',
    allowances: [{ asset: 'usdc', amount: '1000' }],
    expires_at: sessionExpireTimestamp,
    scope: 'omikuji.close',
  });

  yellow.sendMessage(authMessage);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  rl.close();
  process.exit(1);
});
