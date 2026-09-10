# SDK calldata execution tests

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

Exact-In encoding baselines in `src/core/fixtures/exactIn.json` were captured from
the SDK's pre-change git HEAD, covering protocols, wrapping, referrals and splits.
