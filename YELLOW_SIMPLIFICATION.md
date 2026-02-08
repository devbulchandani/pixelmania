# Yellow Network Code Simplification Plan

## Current Issues
- Too complex with manual WebSocket handling
- Redundant code in multiple hooks
- Hard to follow authentication flow
- Missing proper error handling in simplified version

## Reference Pattern (from example)
```typescript
// 1. Simple session key generation
const sessionKey = generateSessionKey();

// 2. Clear auth flow with EIP-712
const authParams = { address, session_key, ... };
const eip712Signer = createEIP712AuthMessageSigner(walletClient, authParams, { name });
const authVerifyMessage = await createAuthVerifyMessage(eip712Signer, challenge);

// 3. Event-driven message handling
yellow.listen(async (message: RPCResponse) => {
  switch (message.method) {
    case RPCMethod.AuthChallenge: // handle
    case RPCMethod.AuthSuccess: // handle
    case RPCMethod.BalanceUpdate: // handle
    ...
  }
});

// 4. Session key signs all non-auth messages
const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
const transferPayload = await createTransferMessage(sessionSigner, {...});
```

## Key Simplifications Needed

### 1. Authentication Flow
**Current:** Complex with promise-based requests
**Simplified:** Event-driven with switch/case

```typescript
// BEFORE (complex)
const authResponse = await sendMessageAndWait('auth_request', ...);
// Handle in separate callback

// AFTER (simple)
sendMessage(authRequest);
// Handle in switch(message.method) { case 'auth_challenge': ... }
```

### 2. Session Key Usage
**Current:** Mixed usage, wallet client created unnecessarily
**Simplified:** Clear separation

```typescript
// Main wallet: ONLY for EIP-712 auth signature
const eip712Signer = createEIP712AuthMessageSigner(walletClient, ...);

// Session key: ALL other message signing
const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
```

### 3. Message Handling
**Current:** Manual promise tracking with Map
**Simplified:** Event-driven listener

```typescript
// BEFORE
const pendingRequestsRef = useRef<Map<number, PendingRequest>>(new Map());
// Complex request/response matching

// AFTER
yellow.listen(async (message) => {
  switch (message.method) {
    case RPCMethod.CreateChannel:
      // Handle directly
      break;
  }
});
```

## Implementation Steps

### Step 1: Update useYellowSession.ts
- [ ] Remove unused wallet client for session key
- [ ] Simplify authentication to match reference pattern
- [ ] Add switch/case message handler
- [ ] Keep request/response tracking for async operations (but simplify)

### Step 2: Update useNitroliteClient.ts
- [x] Already using correct SessionKeyStateSigner ✅
- [x] Signature verification working ✅
- [ ] Remove debug logging (optional)

### Step 3: Update useChannelLifecycle.ts
- [ ] Simplify channel operations
- [ ] Remove redundant error handling
- [ ] Keep force close as-is (works well)

### Step 4: Clean up constants
- [ ] Remove unused constants
- [ ] Consolidate Yellow Network config

## Critical: Don't Break Working Code

**What's working now:**
1. ✅ Signature verification (user + server)
2. ✅ Channel creation with correct participants
3. ✅ Session key as participant[0]
4. ✅ Force close mechanism

**What to keep:**
1. Module-level session key storage (survives re-renders)
2. Proper signature verification with keccak256
3. SessionKeyStateSigner from Nitrolite SDK
4. Request/response matching (needed for promises)

**What to simplify:**
1. Authentication flow (match reference pattern)
2. Message handling (add switch/case)
3. Remove unused session key wallet client
4. Consolidate error handling

## Next Steps

1. Test current simplified version
2. Add proper request/response matching
3. Update UI to use simplified hook
4. Remove old useYellowSession.ts (backup first)
5. Update all imports

## Files to Modify

1. `src/hooks/useYellowSession.ts` - Main simplification
2. `src/hooks/useChannelLifecycle.ts` - Use simplified session
3. `src/app/game/page.tsx` - Update imports
4. `src/utils/yellowConstants.ts` - Clean up

## Testing Checklist

- [ ] Connect to Yellow Network
- [ ] Authenticate with MetaMask (EIP-712)
- [ ] Create channel (session key = participant[0])
- [ ] Deposit funds
- [ ] Resize channel
- [ ] Close channel
- [ ] Force close (unilateral)
- [ ] Page refresh (session key persists)
