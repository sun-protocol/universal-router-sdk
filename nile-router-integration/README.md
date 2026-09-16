# Nile Universal Router integration harness

This is a standalone test project. It does not modify or start QS, and it uses the
SDK only through its public package API. It constructs the QS response shape,
passes it to `parseRouteAPIResponse`, encodes Router calldata, and can optionally
broadcast the transaction to Nile.

The public deployment configuration is in `config/nile.json`. The configured
Universal Router is `TM8zZWPHSwApPYiMvaRPkR1QSMFnqu2pQ2`; the same file contains
Permit2, WTRX, protocol factories, V4 contracts, SafeVault, deployment transaction,
block number and matching Router source commit. These values come from the local
`sunswap-universal-router/config/nile-router.json` and deployment verification record.
Environment variables can override Router and RPC when testing a later deployment.

## Safety boundary

`encode` is the default workflow and never broadcasts. `execute` also refuses to
send unless `NILE_SEND=true`. Keep `.env` and private keys out of source control.
Use a dedicated Nile account, and preferably a recipient different from the payer
for native-input refund assertions.

## Setup and commands

Build the adjacent SDK once, then install this project's dependencies:

```sh
cd .. && npm run build
cd nile-router-integration && npm install
cp .env.example .env
```

```sh
npm test
npm run preflight
npm run probe
npm run list
npm run encode -- v4-trx-usddold-usdt
NILE_SEND=true npm run approve -- v2-usdt-usddold
NILE_ENV_FILE=/path/to/router/.env NILE_RECIPIENT=<address> npm run simulate -- v1-trx-usdt
NILE_SEND=true npm run execute -- v2-usdt-usddold
```

To reuse the ignored deployment environment without copying its private key, run:

```sh
NILE_ENV_FILE=/path/to/sunswap-universal-router/.env npm run preflight
```

Preflight prints only the derived account address and balances. It never prints the
private key and never submits a transaction.

`simulate` builds the real Router call and executes it as a Nile constant call. It
does not sign or broadcast, and writes the quote, calldata, and result under
`reports/`. The live scenarios apply the same 1% maximum-input rule as QS. V1 and
V2 read pool state directly, V4 calls the deployed CLQuoter, and V3 searches for
the exact Router execution boundary with constant calls because this Nile setup
does not publish a V3 Quoter address.

ERC20 scenarios use `approve` for the two independent allowances: token to Permit2,
then Permit2 to Universal Router. The command only raises an allowance when the
current amount or expiration is insufficient, uses a bounded scenario amount, and
records every approval transaction. It refuses to broadcast without
`NILE_SEND=true`.

## Adding a scenario

Add one CommonJS file under `scenarios/`. The loader discovers it automatically:

```js
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')

module.exports = {
  id: 'unique-name',
  description: 'What this case proves',
  recipient: env => env.NILE_RECIPIENT,
  referralRecipient: env => env.NILE_REFERRAL_RECIPIENT,
  buildQuote(env) {
    return buildExactOutQuote({
      tokens: [env.NILE_TOKEN_IN, env.NILE_TOKEN_OUT],
      poolVersions: ['v2'],
      poolFees: ['3000'],
      amountOutRaw: '1000000',
      stepAmountsInRaw: ['1100000'],
      stepAmountsOutRaw: ['1000000'],
      amountInMaximumRaw: '1122000',
    })
  },
  // Optional: beforeExecute({ tronWeb, encoded }),
  // Optional: afterExecute({ tronWeb, encoded, receipt }),
  // Optional: deadlineSeconds and feeLimit.
}
```

Keep chain preparation and balance assertions inside scenario hooks. Shared quote
math and transaction behavior belong in `src/`, so new protocol cases remain small.
Every successful broadcast writes its quote, exact SDK calldata, callValue, receipt,
and transaction ID to `reports/`.

## Current scope

The harness covers V1, V2, V3, and V4 Exact-Out with native and ERC20 payment,
native and ERC20 output, TRX/WTRX wrap and unwrap, maximum-input rejection, output
referral encoding, Permit2 preparation, recipient delivery, and Router balance
cleanup. V2, V3, and V4 include live same-protocol two-pool routes whose QS-shaped
step amounts come from reverse per-hop quotes. The configured Nile Router currently reports a zero `referralVault`, so
all output-referral scenarios are expected simulation failures until the deployment
is configured.

Nile does have a registered `usdt20psm` pool at flag `0x10010`: USDD v2.0
`TZ78...` / USDT New `TZDn...`, PSM `TPj6...`, relative-decimals `10^12`, with
`tin=tout=0` at the latest probe. The two PSM scenario files construct both
Exact-Out directions and include Permit2 and balance assertions. The SDK validates
the PSM flag and `10^12` amount relationship, while the Router's StableFactory is
the authority for whether the concrete token pair is registered.

The verified transaction and expected-failure matrix is in `reports/README.md`.
