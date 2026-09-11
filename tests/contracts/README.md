# SDK calldata execution tests

Exact-Out supports output referral fees only (or no fee). Input referral rejection
is covered by SDK unit tests; contract tests exercise output fees after swaps,
net output checks, actual input payments, native refunds and pure wrapping.

Requires Node.js, Foundry, Solc 0.8.26 installed locally, and a checkout of
`sunswap-universal-router` at `fbd1a93964d159b8c39450652c2285b4dbffc1c1` with its dependencies.

```sh
ROUTER_SOURCE=/path/to/sunswap-universal-router npm run test:contracts
```

The runner copies contracts, dependencies and existing liquidity fixtures into a
temporary directory. It never changes the source checkout. Foundry runs offline;
FFI calls `encode.cjs`, which imports this SDK's built output and returns the actual
command bytes, inputs and callValue used by `UniversalRouter.execute`.

V4 uses the local actual PoolManager and liquidity contracts. Other protocol tests
use controlled pools with the actual Router and Permit2, including V3 callbacks,
native payments, referral-vault accounting, PSM decimal conversion and rollback.
These are local execution tests, not live-network or arbitrary-hook validation.

V2 input is transferred to the first pool by the Router, with intermediate output
sent directly to the next pool. Tests assert pool receipts and conservation across
user payments, referrals and refunds. The controlled V2 pool does not enforce the
constant-product invariant or update reserves; these tests establish Router command
and payment behavior, not production pool accounting.

V4 callers pass fixture fees to `encode.cjs` as a final comma-separated argument
in forward hop order (trailing unused fixture fees are allowed). The encoder
requires a fee for every V4 hop. Current execution fixtures use static fees;
dynamic-fee coverage in the TypeScript tests checks encoding only.

Exact-In encoding baselines in `src/core/fixtures/exactIn.json` were captured from
the SDK's pre-change git HEAD, covering protocols, wrapping, referrals and splits.
