/**
 * Channel helper utilities.
 * Most logic has been moved into useChannelLifecycle.setupChannel().
 */

/**
 * Calculate resize parameters for allocating funds
 */
export function calculateResizeParams(
  currentChannelBalance: bigint,
  targetSpendingAllowance: bigint
): {
  resizeAmount: bigint;
  allocateAmount: bigint;
} {
  // If channel balance < target, need to add funds from custody
  const needsResize = currentChannelBalance < targetSpendingAllowance;
  const resizeAmount = needsResize ? (targetSpendingAllowance - currentChannelBalance) : 0n;

  // Allocate the target amount to unified balance
  const allocateAmount = targetSpendingAllowance;

  return { resizeAmount, allocateAmount };
}
