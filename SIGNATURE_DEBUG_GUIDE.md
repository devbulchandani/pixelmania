# Signature Debugging Guide

## Changes Made

### 1. Created Signature Debug Utilities (`src/utils/signatureDebug.ts`)

**Purpose:** Verify that signatures can be recovered correctly and identify signature format issues.

**Key Functions:**
- `verifyRawSignature()` - Verifies raw ECDSA signatures (what Nitrolite contracts expect)
- `verifyPrefixedSignature()` - Verifies EIP-191 prefixed signatures (what MetaMask produces)
- `verifySignatureBothWays()` - Tests both formats to identify which is being used
- `logChannelStateSignature()` - Logs detailed channel state signature information

### 2. Enhanced SessionKeyStateSigner (`src/hooks/useNitroliteClient.ts`)

**Added:**
- Automatic signature verification after signing each state
- Detailed logging of what's being signed
- Error throwing if signature recovery fails
- Logs show: channelId, turnNum, isFinal, signer address, recovered address

**What to Look For:**
```
[SessionKeyStateSigner] Signing state: { ... }
[Channel State Signature - user] { ... }
[Signature Debug - Raw] { match: ✅ or ❌ }
✅ Signature verified successfully
```

### 3. Added Server Signature Verification (`src/hooks/useChannelLifecycle.ts`)

**Where:**
- Before `createChannel()` - Verifies initial state signature from clearnode
- Before `resizeChannel()` - Verifies resize state signature from clearnode
- Before `closeChannel()` - Verifies final state signature from clearnode

**What It Does:**
1. Extracts clearnode address from participants[1]
2. Calculates the message hash (packed state) that was signed
3. Recovers the signer from the signature
4. Compares recovered address to expected clearnode address
5. Throws error if mismatch

**What to Look For:**
```
[CreateChannel] Verifying server signature from clearnode:
[Signature Debug - Raw] { match: ✅ or ❌ }
✅ Server signature verified successfully
```

---

## How to Test

### Step 1: Enable Debug Logging

All debug logging is already enabled. You'll see detailed logs in the browser console.

### Step 2: Test Channel Creation

1. Connect wallet to the app
2. Click "Start Game" or trigger channel creation
3. Watch the console for signature verification logs

### Expected Log Flow:

```
[Yellow] Session key generated: 0x1234567...
[Nitrolite] Using session key for state signing: 0x1234567...
[Nitrolite] Main wallet for on-chain txs: 0xabcdef...

[Channel Setup] Participant[0] from clearnode: 0x1234567...
[Channel Setup] Session key (expected): 0x1234567...
[Channel Setup] Participant matches session key: true

[Channel Setup] Verifying server signature from clearnode...
[Signature Debug - Raw] {
  messageHash: '0x...',
  recoveredAddress: '0xclearnode...',
  expectedAddress: '0xclearnode...',
  match: ✅
}
✅ Server signature verified successfully

[SessionKeyStateSigner] Signing state: { ... }
[Channel State Signature - user] { ... }
[Signature Debug - Raw] {
  recoveredAddress: '0x1234567...',
  expectedAddress: '0x1234567...',
  match: ✅
}
✅ Signature verified successfully
```

### Step 3: Identify the Issue

**If Server Signature Fails:**
```
❌ Server signature verification FAILED! {
  expectedSigner: '0xclearnode...',
  recoveredAddress: '0xsomeoneelse...',
}
```

This means:
- The clearnode signature is invalid
- Or we're calculating the message hash incorrectly
- Or the clearnode address we extracted is wrong

**If User Signature Fails:**
```
❌ Signature verification FAILED! {
  expectedSigner: '0x1234567...',
  recoveredAddress: '0xabcdef...',
}
```

This means:
- The session key signature is invalid
- Or `createECDSAMessageSigner` is producing wrong format
- Or `getPackedState` is calculating hash incorrectly

**If Contract Still Rejects (`InvalidStateSignatures()`)**
Even after both signatures verify locally, this means:
- The contract is calculating the message hash differently
- Or the signature ordering is wrong (sigs[0] vs sigs[1])
- Or the Channel ID hash doesn't match between client and server

---

## Next Steps Based on Results

### Scenario A: Both Signatures Verify Locally ✅ but Contract Rejects ❌

**Likely Causes:**
1. **Channel ID Mismatch** - Client and server calculate different Channel IDs
2. **Signature Ordering** - Contract expects sigs in different order
3. **Message Hash Calculation** - Contract uses different packing method

**Debug Actions:**
1. Add Channel ID logging:
   ```typescript
   const channelId = getChannelId(channelWithBigInt, base.id);
   console.log('[Channel ID]', channelId);
   ```

2. Log what the contract will receive:
   ```typescript
   console.log('[Contract Call]', {
     channel: channelWithBigInt,
     state: unsignedInitialState,
     signatures: [userSig, serverSig],
   });
   ```

3. Check contract events/logs to see what it calculated

### Scenario B: User Signature Fails ❌

**Likely Causes:**
1. `createECDSAMessageSigner` adds EIP-191 prefix (should be raw)
2. `getPackedState` produces different hash than contract expects
3. Session key private key doesn't match account address (unlikely but possible)

**Debug Actions:**
1. Test signature manually:
   ```typescript
   import { privateKeyToAccount, signMessage } from 'viem/accounts';

   const testAccount = privateKeyToAccount('0x...');
   const testSig = await testAccount.sign({ hash: messageHash });
   // Does this verify correctly?
   ```

2. Check if `createECDSAMessageSigner` source adds prefix

3. Compare `getPackedState` output to manual ABI encoding

### Scenario C: Server Signature Fails ❌

**Likely Causes:**
1. We're extracting the wrong clearnode address
2. We're calculating a different message hash than clearnode signed
3. The serverSignature from clearnode is for a different state

**Debug Actions:**
1. Log all participants:
   ```typescript
   console.log('All participants:', yellowChannelData.channel.participants);
   ```

2. Check if clearnode returns multiple signatures:
   ```typescript
   console.log('Full closeData:', closeData);
   ```

3. Try both participant[0] and participant[1] as clearnode

### Scenario D: Everything Passes but Different Error ✅→❌

If signatures verify but you get a different contract error (not `InvalidStateSignatures`), check:
- `InsufficientFunds` - Custody balance issue
- `InvalidChannel` - Channel not registered
- `InvalidNonce` - Nonce mismatch
- `InvalidIntent` - Wrong state intent

---

## Code Changes Summary

### Files Modified:
1. ✅ `src/utils/signatureDebug.ts` (new file)
2. ✅ `src/hooks/useNitroliteClient.ts`
3. ✅ `src/hooks/useChannelLifecycle.ts`

### No Changes to:
- `src/hooks/useYellowSession.ts` (authentication)
- `src/hooks/useGameSession.ts` (app sessions)
- Any other files

### Why This Approach:
1. **Non-invasive** - Only adds verification, doesn't change logic
2. **Fail-fast** - Catches signature issues before blockchain submission
3. **Debuggable** - Clear logs show exactly where/why failures occur
4. **Reversible** - Can easily remove debug code later

---

## What We're Testing

### Hypothesis:
The `InvalidStateSignatures()` error is caused by one of:
1. User signature not recovering to session key address
2. Server signature not recovering to clearnode address
3. Signatures are valid but contract calculates different message hash
4. Signature ordering is wrong

### This Debug Code Will:
1. ✅ Verify user signatures recover correctly
2. ✅ Verify server signatures recover correctly
3. ✅ Log all signature data for manual inspection
4. ⏳ Identify if issue is with signature generation or contract verification

### After Running Tests:
We'll know EXACTLY which signature is failing and can focus the fix on that specific area.

---

## Running the Test

```bash
# Start the dev server
npm run dev

# Open browser console (F12)
# Connect wallet
# Try to create a channel
# Watch console logs
```

Look for:
- ✅ Green checkmarks = signature verified successfully
- ❌ Red X's = signature verification failed
- Error messages with expected vs recovered addresses

---

## Quick Reference: What Each Log Means

| Log Message | Meaning | Good/Bad |
|-------------|---------|----------|
| `Session key generated` | Fresh session key created | ✅ Good |
| `Using session key for state signing` | NitroliteClient configured | ✅ Good |
| `Participant[0] from clearnode` | Clearnode sent channel data | ✅ Good |
| `Participant matches session key: true` | Session key = participant[0] | ✅ Good |
| `Participant matches session key: false` | **MISMATCH!** | ❌ BAD |
| `✅ Signature verified successfully` | Signature recovers correctly | ✅ Good |
| `❌ Signature verification FAILED` | **Signature invalid!** | ❌ BAD |
| `InvalidStateSignatures()` | Contract rejected signatures | ❌ BAD |

---

## Contact

If you see unexpected behavior or need help interpreting logs, provide:
1. Full console log output
2. Which operation failed (create/resize/close)
3. Session key address (from logs)
4. Main wallet address
5. Any error messages
