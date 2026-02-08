import { CUSTODY_ADDRESS } from '@/utils/yellowConstants';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

/* =====================
   CONFIG — FILL THESE
===================== */

const RPC_URL = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL_BASE_MAINNET;
const PRIVATE_KEY = ""; // MUST be for 0x3B2AdA50...
const CUSTODY = CUSTODY_ADDRESS;

// USDC on Base
const TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/* =====================
   ABI (minimal)
===================== */

const custodyAbi = [
  {
    name: 'getAccountsBalances',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'accounts', type: 'address[]' },
      { name: 'tokens', type: 'address[]' },
    ],
    outputs: [{ type: 'uint256[][]' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
];

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  
  console.log('✅ Using wallet:', account.address);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(RPC_URL),
    account,
  });

  console.log('🔍 Reading withdrawable balance…');

  const balances = await publicClient.readContract({
    address: CUSTODY,
    abi: custodyAbi,
    functionName: 'getAccountsBalances',
    args: [[account.address], [TOKEN_ADDRESS]],
  });

  const available = balances[0][0];
  console.log('Available (raw):', available.toString());

  if (available === 0n) {
    console.log('❌ No withdrawable balance.');
    console.log('ℹ️ Funds may be locked in an open channel.');
    return;
  }

  console.log('🚀 Withdrawing FULL balance…');

  const txHash = await walletClient.writeContract({
    address: CUSTODY_ADDRESS,
    abi: custodyAbi,
    functionName: 'withdraw',
    args: [TOKEN_ADDRESS, available],
  });

  console.log('✅ Withdrawal sent');
  console.log('TX:', txHash);
  console.log('Funds will arrive in:', account.address);
}

main().catch((err) => {
  console.error('❌ Error:', err);
});
