# Nile execution results

## V1 TRX to USDT Exact-Out

- Date: 2026-09-14
- Router: `TM8zZWPHSwApPYiMvaRPkR1QSMFnqu2pQ2`
- Transaction: `aa77bcefcbd1c3b19051042c6c06e64dcb781ba197ad1f694860365ffe073e52`
- Block: `70952962`
- Receipt: `SUCCESS`
- Net target and recipient increase: `100000` raw USDT (`0.1 USDT`)
- Live V1 quoted and actual swap input: `94566 SUN` (`0.094566 TRX`)
- Maximum input sent: `95511 SUN`
- Unused input refunded: `945 SUN`
- Energy used: `96736`
- Transaction fee: `10793600 SUN` (`10.7936 TRX`)
- Router TRX balance after execution: unchanged from before execution
- Router USDT balance after execution: unchanged from before execution

The generated JSON report is intentionally ignored because execution receipts are
runtime artifacts. It contains the constructed QS response, exact SDK calldata,
full receipt and before/after assertion values.

## V2 TRX to USDT Exact-Out

- Date: 2026-09-14
- Transaction: `3b3a00afd8047b145c856df8036dc7ab34afa7ff434d50be6eeb73d4bf96936f`
- Block: `70953285`
- Receipt: `SUCCESS`
- Net target: `100000` raw USDT
- Recipient increase: `100001` raw USDT (one raw-unit pool rounding surplus)
- Quoted input: `68171 SUN`; maximum input: `68852 SUN`
- Energy used: `174432`
- Transaction fee: `18819200 SUN` (`18.8192 TRX`)

The initial local assertion required equality and therefore failed after the
successful broadcast. Exact-Out requires at least the target; the harness now records
any positive pool rounding surplus and still rejects a shortfall.

## Verified matrix

| Scenario | Result | Transaction / evidence |
| --- | --- | --- |
| V1 TRX→USDT | SUCCESS | `aa77bcefcbd1c3b19051042c6c06e64dcb781ba197ad1f694860365ffe073e52` |
| V1 USDT→TRX | SUCCESS | `681b8b8691f028616e6761959554463f7ae3577a625cff0f5ecc07cbec995d5e` |
| V2 TRX→WTRX→USDT | SUCCESS | `3b3a00afd8047b145c856df8036dc7ab34afa7ff434d50be6eeb73d4bf96936f` |
| V2 USDT→USDDOLD | SUCCESS | `ebd82df6b71dc3e7e6e68270a6cd1439fd30346c618298e3434c12950f0b68bf` |
| V3 TRX→WTRX→USDT | SUCCESS | `c352d105d45bcaedb4cf12f63fbd68055684a8025e93688f61fd67b6248c73a3` |
| V3 USDT→USDDOLD | SUCCESS | `df187b6baa10d1a23a6ec7ea992047c4f52d4c1e5a6a10034b75dac82cb9a744` |
| V4 native TRX→USDT | SUCCESS | `2ca9a341a02ba4e1acfa677e1dc5f13549f6be35bd7e3c482368a9da34c46e08` |
| V4 USDT→native TRX | SUCCESS | `d196d405ec89e154da088df3f51fbef0f6986eb22da835bd5de69dc66fc8f4cf` |
| Pure TRX→WTRX | SUCCESS | `3138fde3a7f85fb0985fad919d442e263e9c281801855966a41a0c3aca665f19` |
| Pure WTRX→TRX | SUCCESS | `564e801760278199c586ff94b694ac11c5bc848b2e5089a96473f07c8ab849de` |
| V2 TRX→WTRX→USDDOLD→USDT | SUCCESS | `db2dd6213831af3a1b0cc0d0cdd14baded8b3855723706f2cc3314cdf2b3252d` |
| V3 TRX→WTRX→USDDOLD→USDT | SUCCESS | `abacda25e80c46cedbc7abe6e1a806abe0e8b10e04590c3d603efd68fe3115a0` |
| V4 native TRX→USDDOLD→USDT | SUCCESS | `901db84e7f8b0342106fa687fe0e8cc2f8d7a9b3788ce0b3ea67346267b8e435` |
| PSM USDT New↔USDD v2.0 | Encoding ready | Nile pool is registered at `0x10010` and `tin=tout=0`; both directions now pass the SDK boundary |
| V2 max input = required − 1 | Expected revert | Required `68171`, supplied `68170` raw TRX |
| V1/V2/V3/V4 output referral | Deployment blocked | Router `referralVault()` is zero; each tested call reaches an expected revert |

Every successful route asserts that the recipient received at least the Exact-Out
target, the payer spent no more than `amountInMaximumRaw`, and the Router retained
no route-related TRX/WTRX/output-token balance. ERC20 allowance transaction IDs and
full receipts are stored in the ignored runtime JSON reports.
