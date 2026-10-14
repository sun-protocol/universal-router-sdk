# universal-router-sdk Examples

This directory contains runnable SDK examples and Nile/mainnet integration scripts.

## Directory structure

```text
examples/
├── .env.example              Environment template; copy to .env and configure keys
├── package.json
├── tsconfig.json             Compiles to ./dist
└── v4-swap/
    ├── address.ts            Network-specific address selection
    ├── address.nile.ts       Nile token and contract addresses
    ├── address.mainnet.ts    Mainnet token and contract addresses
    ├── helper.ts             tronWebNile / tronWebMainnet, network constants, ABI decoding
    ├── errorSelector.ts      Looks up revert errors by transaction ID
    ├── quote.ts              Single quote through PoolManager / Quoter
    ├── swap.ts               Single swap through the router API, Permit2, and UniversalRouter
    ├── swapWithoutApi.ts     Single swap using a manually constructed route
    ├── integrateTest.ts      Batch integration runner; writes transaction results
    └── txBatchCheck.ts       Reads saved results and checks on-chain transaction status
```

## Setup

### 1. Node.js and dependencies

- Node.js >= 20 (see `engines` in the root `package.json`).
- Build the SDK at the repository root before installing example dependencies:

```bash
# Repository root
npm install
npm run build          # Generates dist/; examples depend on the SDK through file:..

# Examples directory
cd examples
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```text
# Nile testnet
PRIVATE_KEY_NILE=<nile-private-key-hex>
PRIVATE_KEY=<deprecated, fallback for PRIVATE_KEY_NILE>

# Mainnet: must be explicitly supplied; no fallback
PRIVATE_KEY_MAINNET=<mainnet-private-key-hex>

# Required referral project address for mainnet batch integration tests
REFERRAL_PROJECT_ADDRESS_MAINNET=<your-mainnet-project-address>
```

Mainnet and testnet keys **never fall back to each other**, preventing accidental use of a testnet key on mainnet or vice versa.

### 3. Compile

These examples do not use ts-node or tsx. Compile before running:

```bash
npx tsc                # Outputs to ./dist
```

Run `npx tsc` again after changing source files.

## Typical test flow

```text
Edit cases → integrateTest → testCases.<network>.json → txBatchCheck
             Send transactions and save IDs             Inspect on-chain results
```

1. **Edit `testCases` in `v4-swap/integrateTest.ts`.** Toggle `groupWhiteList` entries or mark individual cases with `picked: true`.
2. **Run the batch:**

   ```bash
   node dist/v4-swap/integrateTest.js
   ```

   Each case prints a message such as:

   ```text
   ✅ Running TRX->USDT input 0.5% (group: input referral, referral: input/50bps)
   ```

   Results are saved to `dist/v4-swap/testCases.<network>.json`, including `txId`, `error`, and `appliedReferral`.
3. **Inspect on-chain results:**

   ```bash
   node dist/v4-swap/txBatchCheck.js
   ```

   Records are color-coded by group, referral mode, and transaction status.

## Commands

| Purpose | Command |
| --- | --- |
| Install dependencies | `npm install` (first run `npm install && npm run build` at the repository root) |
| Compile | `npx tsc` |
| Type-check without emitting files | `npx tsc --noEmit` |
| Single quote on Nile, directly through contracts | `node dist/v4-swap/quote.js` |
| Single swap on Nile through the router API | `node dist/v4-swap/swap.js` |
| Single swap on Nile with a manual route | `node dist/v4-swap/swapWithoutApi.js` |
| Batch integration tests on Nile (default) | `node dist/v4-swap/integrateTest.js` |
| Batch integration tests on mainnet | `MAINNET_CONFIRM=yes NETWORK=mainnet node dist/v4-swap/integrateTest.js` |
| Inspect batch results on Nile | `node dist/v4-swap/txBatchCheck.js` |
| Inspect batch results on mainnet | `NETWORK=mainnet node dist/v4-swap/txBatchCheck.js` |

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `NETWORK` | `nile` | Network selection: `nile` or `mainnet` |
| `MAINNET_CONFIRM` | — | Must be `yes` when `NETWORK=mainnet`; otherwise the runner refuses to start |
| `REFERRAL_PROJECT_ADDRESS_MAINNET` | — | Required for mainnet integration tests; otherwise the runner refuses to start |
| `GROUPS` | — | Comma-separated group allowlist overriding `groupWhiteList`; for example, `GROUPS="v3 swap,v4 swap"` runs only V3 and V4 |
| `PRIVATE_KEY_NILE` / `PRIVATE_KEY` | — | Nile private key; the former takes precedence |
| `PRIVATE_KEY_MAINNET` | — | Mainnet private key, with **no fallback** |

### Output files

`integrateTest` writes separate files per network:

- Nile: `dist/v4-swap/testCases.nile.json`
- Mainnet: `dist/v4-swap/testCases.mainnet.json`

`txBatchCheck` selects `testCases.<network>.json` using `NETWORK`.

## Managing test cases in integrateTest.ts

### Groups with groupWhiteList

All groups are enabled by default. To run selected groups, set the others to `false`:

```ts
const groupWhiteList: Record<string, boolean> = {
  [V1_GROUP]: false,
  [V2_GROUP]: false,
  [V3_GROUP]: true,        // Run V3
  [V4_GROUP]: true,        // and V4 only
  // ...
}
```

### Selecting individual cases with picked

If any case has `picked: true`, only picked cases run, still subject to `groupWhiteList` filtering:

```ts
{ group: 'v3 swap', name: 'TRX->USDT', picked: true, swapParams: { ... } }
```

### Network restrictions

For a case that applies only to certain networks, such as a token available only on Nile, set `networks?: ('mainnet'|'nile')[]`:

```ts
{
  group: 'psm swap',
  name: 'USDTNEW->USDD ...',
  networks: ['nile'],   // Automatically skipped on mainnet
  swapParams: { ... },
}
```

Omitting `networks` allows both networks. Cases currently marked Nile-only include:

- Stable swap cases referencing `USDDOLD_ADDRESS`.
- All `psm swap` cases, which depend on `USDTNEW_ADDRESS`.
- All `htx sun swap` cases, which depend on `THTX_ADDRESS` / `TSUN_ADDRESS`.

### Automatic mainnet amount scaling

When `network === 'mainnet'`, `integrateTest` reduces sample amounts to small values to limit the funds used by a batch:

| Sample | Nile | Mainnet |
| --- | --- | --- |
| `amountSampleDecimals3` | 1e3 | 1e1 |
| `amountSampleDecimals5` | 1e5 | 1e3 |
| `amountSampleDecimals6` | 1e6 | 1e3 |
| `amountSampleDecimals18` | 1e18 | 1e15 |

Set `SwapParams.slippageBips` per case to override the default of 50 bips (0.5%).

### Referral fields in SwapParams

| Field | Meaning |
| --- | --- |
| `amountInReferralBps` | Input referral fee in bps, capped at 85 |
| `amountOutReferralBps` | Output referral fee in bps, capped at 85 |
| `referralProjectAddress` | Project address receiving referral credit |
| `noReferral: true` | Explicit opt-out, disabling the `DEFAULT_REFERRAL` fallback |

The router API does not allow both `amountInReferralBps` and `amountOutReferralBps` to be set. `/swap/routerUniversal` rejects this with `amountInReferralBips and amountOutReferralBips cannot both be set`. Although the example helper `computeAppliedReferral` can prioritize input fees over output fees for direct `TradePlanner` construction, that fallback does not override the router API restriction.

### Negative cases with expectError

For expected failures, such as the router API restriction above, add `expectError` to the `TestCase`. The runner treats a matching thrown error as a passing case:

```ts
{
  group: 'referral edge case',
  name: 'router rejects both in & out bps (negative)',
  swapParams: { /* both bps set */ },
  expectError: 'amountInReferralBips and amountOutReferralBips cannot both be set',
}
```

A match means that the thrown `Error.message` contains the `expectError` substring:

| Actual behavior | Runner handling | txBatchCheck display |
| --- | --- | --- |
| Matching error thrown | `expectedErrorMet=true`, no txId | Green `✓ EXPECTED_ERROR` |
| Different error thrown | Stored in the usual `error` field | Red `❌ <message>` |
| No error thrown; swap succeeded | Generates an `error` stating "expected error not raised" | Red `❌ ...` |

### DEFAULT_REFERRAL fallback

When a case specifies no referral fields and does not set `noReferral: true`, the following defaults apply:

```ts
const DEFAULT_REFERRAL = {
  amountInReferralBps: 50,
  amountOutReferralBps: 0,
  referralProjectAddress: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
}
```

This preserves default input referral behavior for the existing V1 / V2 / V3 / V4 / stable / PSM / HTX_SUN / mixed cases without configuring each case individually.

### Effective referral settings

Saved results include `appliedReferral` for each case. Its mode is `input`, `output`, or `none`; for example:

```json
{
  "appliedReferral": {
    "mode": "input",
    "bps": 50,
    "projectAddress": "..."
  }
}
```

`txBatchCheck` displays a label such as `[ref: input/50bps]` so the effective referral mode can be checked for each transaction.

## Troubleshooting

- **`Cannot find module '@sun-protocol/universal-router-sdk'`**: Build the SDK by running `npm run build` at the repository root.
- **`Cannot find module './testCases.<network>.json'` when running txBatchCheck**: Run `integrateTest` with the same `NETWORK` first. It writes results to `dist/v4-swap/testCases.<network>.json`.
- **`Refusing to run on mainnet without MAINNET_CONFIRM=yes`**: Explicitly set `MAINNET_CONFIRM=yes` to run mainnet batch tests.
- **`REFERRAL_PROJECT_ADDRESS_MAINNET env var is required`**: Set the mainnet referral project address before running integration tests so fees are attributed to the intended project.
- **A case fails to submit a transaction**: Isolate it with `picked: true`, then use `errorSelector.ts` to inspect the revert reason. `txBatchCheck` already invokes this lookup automatically.
