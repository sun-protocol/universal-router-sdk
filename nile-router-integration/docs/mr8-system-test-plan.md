# MR 8 system regression plan

## Scope

MR 8 (`fix/exact-output-swaps` into `release/v1.2.0`) changes V1, PSM, V3 and
the V4 periphery dependency. The system suite exercises the deployed Nile
Universal Router at `TPpiiS3FiDxBMRzyhfaQDokxqybchY3vNz`. It constructs QS-shaped
responses and crosses the public SDK boundary unless the SDK intentionally cannot
represent a contract-only edge case.

Every successful state-changing case must prove:

- the payer spent the expected input, or no more than the Exact-Out maximum;
- the recipient received at least the requested output;
- the Universal Router retained no route-related input or output token;
- the transaction receipt reports `SUCCESS`.

Expected failures use a constant call and must revert before any transaction is
broadcast.

## Coverage matrix

| Contract change | Nile system cases | Required evidence |
| --- | --- | --- |
| V1 paths contain only endpoints and token-to-token bridges through TRX | Exact-In and Exact-Out for TRX→USDT, USDT→TRX and USDT→USDDOLD | Input/output deltas, token-to-token delivery, Router cleanup |
| V1 output quotes and maximum input enforcement | Exact-Out maximum one raw unit below the live quote | Expected constant-call revert |
| V1 recipient balance-based minimum output | Exact-In minimum above the live quote | Expected constant-call revert |
| PSM Exact-In balance-delta accounting | Exact-In in both USDD/USDT New directions | Exact input/output deltas and Router cleanup |
| PSM Exact-Out actual output transfer and SafeTransfer compatibility | Exact-Out in both directions | Real transactions, including USDD→USDT New final sweep |
| PSM reverse quote rounds input up | USDT New→USDD target not divisible by `10^12` | One extra raw USDT input and full rounded surplus delivered |
| PSM maximum input | Same non-divisible target with the rounded input one unit too low | Expected constant-call revert |
| V3 output path remains executable | V3 Exact-In and Exact-Out TRX→USDT | Recipient output and Router cleanup |
| V4 partial Exact-Out settlement | V4 single-hop and two-pool Exact-Out | Maximum input respected and Router cleanup |
| Cross-protocol command dispatch and custody | V2 single/multi-hop, TRX/WTRX wrap and unwrap | Existing state-changing scenarios rerun on the new Router |
| Output referral after Router/Vault binding | V1, V2, V3 and V4 TRX→USDT Exact-Out with 1% output fee | Vault inflow, 80/20 rebate/protocol accounting and Router cleanup |

## Forge-only cases

The following MR behaviors cannot be reproduced safely against public Nile pools
and remain contract-level tests:

- a V3 pool reports mainnet USDT output without transferring it;
- PSM output shortfall tries to consume a pre-existing Router balance;
- PSM multi-pool amount propagation when two registered PSM pools are required;
- malformed paths, repeated endpoints and missing exchanges;
- V1 native input with a user payer instead of the Router.

Run the MR test contracts and the complete Forge suite. These tests complement,
rather than replace, live Nile execution.

## Execution order

1. Validate addresses and encode every scenario locally.
2. Run all expected-revert simulations.
3. Prepare bounded ERC20→Permit2 and Permit2→Router allowances.
4. Execute funding-preserving pairs in order: USDT New→USDD then the reverse.
5. Execute the V1, V2, V3, V4, wrap and unwrap positive matrix.
6. Record transaction IDs, balance assertions and any environment limitation.

The Router is bound to `TLpUjeu6oJZsUyxW8N3FnRtqxb4yVxMaLd`. The suite requires
the Vault to point back to this Router and its maximum referral rate to be at least
100 bips.
