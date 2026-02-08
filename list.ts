/**
 * List all open channels for your wallet
 * Run with: bun run list-channels.ts
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';

const CUSTODY_ADDRESS = '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6';
const ADJUDICATOR_ADDRESS = '0x7de4A0736Cf5740fD3Ca2F2e9cc85c9AC223eF0C';

async function main() {
  console.log('📋 Listing Your Open Channels\n');

  const privateKey = "";
  const account = privateKeyToAccount(privateKey as any);

  console.log('Wallet:', account.address);
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

  const nitroliteClient = new NitroliteClient({
    walletClient: walletClient as any,
    publicClient: publicClient as any,
    stateSigner: new WalletStateSigner(walletClient),
    addresses: {
      custody: CUSTODY_ADDRESS as any,
      adjudicator: ADJUDICATOR_ADDRESS as any,
    },
    chainId: base.id,
    challengeDuration: 3600n,
  });

  try {
    console.log('🔍 Fetching channels from blockchain...\n');

    const channels = await nitroliteClient.getOpenChannels();

    if (channels.length === 0) {
      console.log('✅ No open channels found');
      return;
    }

    console.log(`Found ${channels.length} channel(s):\n`);

    for (const channel of channels) {
      console.log('📍 Channel ID:', channel);
      console.log('   Status:', channel ? '🟢 OPEN' : '🔴 CLOSED');
      console.log('   Participants:');
      // console.log('     - Player:', channel?.participants?.[0] || 'N/A');
      // console.log('     - Broker:', channel?.participants?.[1] || 'N/A');

      if (channel) {
        console.log('\n   💡 To close this channel, update close.ts line 30:');
        console.log(`   const STUCK_CHANNEL_ID = '${channel}' as Hex;\n`);
      }
      console.log('');
    }
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main();
