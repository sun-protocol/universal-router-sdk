# Nile execution results

## Current deployment

- Router: `TPpiiS3FiDxBMRzyhfaQDokxqybchY3vNz`
- Contract name: `UniversalRouter`
- ReferralVault: `TLpUjeu6oJZsUyxW8N3FnRtqxb4yVxMaLd`
- Vault `setRouter` transaction:
  `0b41a7138a71244fc8c8d2fa8495ff1a827dbcd1b7373301240df0d99b866ffe`
- Router `setReferralVault` transaction:
  `de722c156f31fd36826a37e52b0e3d83f7a49d1ac60561c8fb9511097b3eb291`
- PSM USDD v2.0→USDT New: SUCCESS, transaction
  `092be8d31e3fadb6aa72ca2b3934e94990ac398b56603dee87b067bfa99830ce`,
  block `71126832`, `309689` energy
- PSM USDT New→USDD v2.0: SUCCESS, transaction
  `d42f50fed967dce04a99127c87d871d0b914fa92ad6173a987ef9644638a4789`,
  block `71126890`, `296669` energy

The transaction logs verify exact `0.1`-unit input and output transfers in both
directions. After the round trip, the payer's USDD and USDT New balances returned
to their starting values, and the Router held zero of both tokens. This verifies
the USDT New `SafeTransferLib` compatibility change during real execution. The
deployment transaction, block, and source commit have not yet been supplied.

## MR 8 full regression — 2026-09-21

All 28 state-changing scenarios below completed with `SUCCESS`. Each scenario
asserted recipient delivery and zero route-related Router balance after execution.

| Area | Scenario | Transaction |
| --- | --- | --- |
| PSM | Exact-In USDT New→USDD | `58fcbd1867f4e27217664e5ca4540926ea8b2bcac29eeb5d3c84f1e385084efb` |
| PSM | Exact-In USDD→USDT New | `af2241b5ee6645988a3ac6651cde782ea2e12882e37c90cfcc459a672658c8b9` |
| PSM | Exact-Out USDT New→USDD | `d42f50fed967dce04a99127c87d871d0b914fa92ad6173a987ef9644638a4789` |
| PSM | Exact-Out USDD→USDT New | `092be8d31e3fadb6aa72ca2b3934e94990ac398b56603dee87b067bfa99830ce` |
| PSM | Non-divisible Exact-Out rounds up | `daca77cc887b6a79d8d5005ae71b4b7bf74ba23b41a387ce5a469bba27cc34c1` |
| PSM | Rounded-funds reverse cleanup | `163599b05b1480e794146676fb02ad32bf383b2cbaeb98b16b20e755fb801c3f` |
| V1 | Exact-In TRX→USDT | `b605a7c5e14372b8d3074ddb5239763ea935428f678a0d7fc73e6eca09991cbc` |
| V1 | Exact-In USDT→TRX | `e61b1125fa39e4c52ed039b859888506118b896773ab453ddf2d250c83547366` |
| V1 | Exact-In USDT→USDDOLD | `1fa7276023effad4874341f7e669dd4292473a9bccba16580dcbc51b59b091ac` |
| V1 | Exact-Out TRX→USDT | `6fae49a9bf9eee3e8fbef5426fd590117d72e0509906eb3434ab6c35bbd736e0` |
| V1 | Exact-Out USDT→TRX | `481749ef64418895afd82b72a16ad5ee942aa80dbbd199e7f87a5e56bf8bf44d` |
| V1 | Exact-Out USDT→USDDOLD | `8e53785dd1de8203fdcc205793c5aa4528358a1fc3c54377633bd38972c2cd7c` |
| V2 | Exact-Out TRX→USDT | `f3011415874830bcf76faae8327899cd649de812883758db2593438a81b4c5ca` |
| V2 | Exact-Out USDT→USDDOLD | `1b1854bdba85d4fe0b00f379be692eb60b3603647d5d839ae97414bc74c1f37a` |
| V2 | Two-pool Exact-Out TRX→USDDOLD→USDT | `38a01a0c9d1c1f958e9a504982886cfcd8022366b70b6275f6ddb6c4c5f43fc3` |
| V3 | Exact-In TRX→USDT | `3c3ed502659d9bc9043a4b0080290af8dca827ac0185298cba6cb21bbae9d143` |
| V3 | Exact-Out TRX→USDT | `1bd239229b0283d2c2f2b326dc2d74f424eb5807e8bfbf996b551bbde5114167` |
| V3 | Exact-Out USDT→USDDOLD | `a7e711a9f7bc8298af72d23dd932848a0e65c2e4b3e0a65f4229cbe6fc24387a` |
| V3 | Two-pool Exact-Out TRX→USDDOLD→USDT | `4f339d5ed514439f018b53866e54221c872b1578a699a8926ece704973ce2ad7` |
| V4 | Exact-Out TRX→USDT | `6364991634a8a6eab7637c80670308b2ccb37ffa7e62c0943789b07f30f69c04` |
| V4 | Exact-Out USDT→TRX | `66bf0f3151e95b0cd8168d7873733ae90a9982f4db366198b9202b39996b5399` |
| V4 | Two-pool Exact-Out TRX→USDDOLD→USDT | `abb819ed85a4cb7a960fb05d2d89d6ebfbcc52a636e529718176caef8dee042a` |
| WTRX | TRX→WTRX with refund | `4332e62e0781f6e27fc76d5a16d3630c22d4a9e20f70ec05a113eb9d1f9eb865` |
| WTRX | WTRX→TRX | `b4f3caf2af8dbd0d9908998afb276352e27c2dfceb2a67938c351a6e18fcb0bb` |
| Referral | V1 Exact-Out TRX→USDT, 1% output fee | `e85bf7df89a6cda3ed2d496d49f88b201ddad3c25fdcc2dc8b389fb97e5d7290` |
| Referral | V2 Exact-Out TRX→USDT, 1% output fee | `87dd27a49e9a081d69fdbb0f4f2e506f7a8d2b623df291c7fa704055da1ab72e` |
| Referral | V3 Exact-Out TRX→USDT, 1% output fee | `1e88c99bb15521891a9561a18491ef331398ab86cfaecc78e9d333e00b89bc74` |
| Referral | V4 Exact-Out TRX→USDT, 1% output fee | `107eb2f41ab30cf031ca7cd3169f21676c8e183c612f845ab08db4f2dfdf096a` |

The four negative system cases also passed: V1 Exact-In minimum output above the
live quote, V1 token-to-token Exact-Out maximum input one unit below the quote,
PSM non-divisible Exact-Out without the rounded-up input unit, and V2 Exact-Out
maximum input one unit below the quote all reverted during constant-call execution.

Each referral case transferred `1010` raw USDT into the Vault, credited `808` to
the rebate recipient and `202` to protocol funds. The recipient received the
`100000` raw USDT net target and the Router retained no route-related balance.

After an interrupted duplicate batch consumed the account's remaining USDD, the
PSM Exact-In setup route was run once more to restore the reusable test balance:
`d6e2aa10d7c8bc18d733c3198f04f6cac47851fd6c70c1764eaf8135ef47ff35`.

The MR-specific Forge selection passed 77 tests. The complete contract suite then
passed 350 tests across 18 suites with no failures. Forge still prints the existing
Permit2 `StructBuilder.sol` import-resolution diagnostics, but compilation and all
selected tests complete successfully.

## Previous referral-enabled deployment

- Router: `TBWVCXLMBSNJXPZU3RPjEhp6tDo5FDiHsm`
- Deployment transaction: `cacf1a318d4534c376c5de64f64cdb10f120fb6fb0f68cd09f9f3e9daa575017`
- Deployment block: `71121241`
- ReferralVault: `TLpUjeu6oJZsUyxW8N3FnRtqxb4yVxMaLd`
- Maximum referral rate: `100` bips

The V1, V2, V3, and V4 1% output-referral scenarios pass constant-call simulation
and state-changing execution against the current deployment. Each execution sent
`1010` raw USDT to the ReferralVault, credited `808` to the rebate recipient, and
credited `202` to the protocol. The recipient received at least the `100000` raw
USDT net target, and the Router retained no route-related balance.

| Protocol | Transaction | Recipient output |
| --- | --- | ---: |
| V1 | `75528312c150708d2505045809641023fe8d9f644ff0c74af36211dfd47da47e` | `100000` |
| V2 | `9a3497eae7c331de3dbe988e834aade791b5f8effe6556849fc39c8826390bf7` | `100001` |
| V3 | `38bed40516dec65970aa63c65e2b0db7d2af42e8f5124d4fcb559d1235d55848` | `100000` |
| V4 | `bc9b6b580177cc05b358daf0932f2e7847fea461f61d017712972a6ba4a014de` | `100000` |

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
| PSM USDT New→USDD v2.0 | SUCCESS | New Router transaction `d42f50fed967dce04a99127c87d871d0b914fa92ad6173a987ef9644638a4789` |
| PSM USDD v2.0→USDT New | SUCCESS | New Router transaction `092be8d31e3fadb6aa72ca2b3934e94990ac398b56603dee87b067bfa99830ce`; prior Router transaction `e700bc93fe0398dd28b099da916ada642dd94862d7b104c39fa4624b41dd904e` documents the old final-sweep failure |
| V2 max input = required − 1 | Expected revert | Required `68171`, supplied `68170` raw TRX |
| V1/V2/V3/V4 1% output referral | SUCCESS | Four live transactions verify recipient delivery, Router cleanup, and `808/202` Vault accounting |

Every successful route asserts that the recipient received at least the Exact-Out
target, the payer spent no more than `amountInMaximumRaw`, and the Router retained
no route-related TRX/WTRX/output-token balance. ERC20 allowance transaction IDs and
full receipts are stored in the ignored runtime JSON reports.
