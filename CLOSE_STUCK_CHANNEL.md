# How to Close Stuck Channel

## Problem
You created a channel successfully, but the deposit failed due to a nonce collision. The channel now exists on Yellow Network but is unusable.

## Solution

### Option 1: Use the UI (Recommended)
1. Go to the game page: http://localhost:3000/game
2. You should see "Yellow channel active" with the channel ID
3. Click the **"Close Channel"** button
4. Confirm the MetaMask transaction
5. Once closed, you can create a new channel

### Option 2: Close via apps.yellow.com
1. Visit https://apps.yellow.com
2. Connect your wallet (0xaedce0cc...)
3. Find your open channel in the dashboard
4. Click "Close Channel"
5. Confirm the transaction

## What I Fixed
The nonce collision issue was caused by trying to send multiple transactions too quickly:

1. **Before Fix:**
   - Create channel (nonce 0) → Send immediately
   - Approve tokens (nonce 0) → ERROR! Nonce already used
   - Deposit (nonce 1) → Never reached

2. **After Fix:**
   - Create channel (nonce 0) → **WAIT for confirmation** ✅
   - Approve tokens (nonce 1) → **WAIT for confirmation** ✅
   - Deposit (nonce 2) → **WAIT for confirmation** ✅
   - Resize channel (nonce 3) → **WAIT for confirmation** ✅

## Next Steps
1. Close the stuck channel using Option 1 or 2 above
2. Refresh the page
3. Try creating a new channel - it should work now!
4. The system will now properly wait for each transaction to be mined

## Technical Details
I added `waitForTransactionReceipt()` calls and 1-second delays between transactions in `/src/hooks/useChannelLifecycle.ts` to prevent nonce collisions.
