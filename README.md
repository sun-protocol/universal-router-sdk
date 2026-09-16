# @sun-protocol/universal-router-sdk

A TypeScript SDK for encoding swap transactions targeting the **Universal Router** contract on the TRON blockchain. It supports multi-protocol routing across SunSwap V1/V2/V3/V4, Curve Stable pools, PSM, HTX Sun, and WTRX wrap/unwrap — all within a single transaction.

## Installation

```bash
npm install @sun-protocol/universal-router-sdk
```

## Requirements

- Node.js >= 20
- TypeScript >= 5.0

## Quick Start

```typescript
import {
  TradePlanner,
  SwapTradeRoute,
  Currency,
  newV2Pool,
  parseRouteAPIResponse,
} from '@sun-protocol/universal-router-sdk'

// 1. Define a swap route (or use parseRouteAPIResponse to build from Route API)
const route: SwapTradeRoute = {
  pools: [newV2Pool(new Currency('TOKEN_A'), new Currency('TOKEN_B'))],
  input: new Currency('TOKEN_A'),
  output: new Currency('TOKEN_B'),
  amountIn: 1_000_000n,
  minimumAmountOut: 950_000n,
}

// 2. Encode the transaction
const planner = new TradePlanner([route])
planner.encode()

// 3. Use planner.commands and planner.inputs to call the Universal Router contract
console.log(planner.commands) // Hex-encoded command bytes
console.log(planner.inputs)   // Hex-encoded input array
```

## Native Exact-Out

Pass one `EXACT_OUT` quote with `grossAmountOutRaw` from QS. Omitted `tradeType` still means Exact-In. Exact-Out uses the quoted maximum input and gross output; do not pass a slippage override or split options. The SDK does not read QS per-hop raw amount fields.

Exact-Out supports no referral fee or **output referral fees only**. Request QS quotes with zero input referral bips. Quotes with nonzero `amountInReferralBips` and SDK options with `mode: 'input'` (even at zero bps) are rejected. Exact-In retains both referral modes. The SDK does not read QS's raw referral amount fields; the Router calculates the output fee from its balance and the quoted bips.

QS's trailing `poolFees` display entry is ignored. Like Exact-In, Exact-Out treats the network-specific TRX/WTRX pair as wrapping or unwrapping, including when labelled `v2`, `v3`, or `v4`. The SDK does not read per-hop execution mode fields; Exact-Out still validates the supported pool versions and wrap/unwrap boundaries.

For Exact-Out, display and validate the net output target using `route.amountOut`. The `SwapTradeRoute` and `RouteData` unions expose minimum-output fields only after narrowing to Exact-In.

```typescript
const route = parseRouteAPIResponse(quote, false)
route.recipient = new Address(recipientAddress) // optional; defaults to the sender
const planner = new TradePlanner([route], false, {
  // Required for a quote with a nonzero output fee; use mode: 'output' and matching bps.
  referralOptions,
})
planner.encode()

// TronWeb callValue is in SUN. Guard conversion if the client requires a number.
if (planner.callValue > BigInt(Number.MAX_SAFE_INTEGER)) {
  throw new Error('callValue exceeds the client safe integer range')
}
await router.execute(planner.commands, planner.inputs, deadline).send({
  callValue: Number(planner.callValue),
})
```

Import `Address`, `TradePlanner`, and `parseRouteAPIResponse` from this package. For ERC20 input, approve Permit2 on the token and give the Router a Permit2 allowance. Covering `route.maximumAmountIn` allows execution throughout the quoted budget; ordinary user-paid swaps only pull the actual required input. V4 settles its actual debt after swapping. Output referral fees are charged after the swap (and any output unwrap), followed by a SWEEP that checks the net output target.

For TRX input, `callValue` is the maximum total input, all available for the swap; no input referral is charged. Unused TRX is refunded (unused WTRX from an entry wrap is unwrapped first). **The configured recipient receives both output and refunds**, including when it differs from the payer. Create a fresh planner and call `encode()` once per transaction; repeated calls append commands.

| Exact-Out route | Encoding support |
| --- | --- |
| V1 | TRX→Token, Token→TRX, Token→Token (internal TRX bridge); controlled exchange execution tests |
| V2 | Single protocol, single or multiple distinct pools; validated through actual Router commands and payments with controlled pool accounting |
| V3 | Single protocol, single or multiple distinct pools; controlled pools validate callback payment |
| V4 | Single or multiple pools through the Router's fixed Manager; actual-debt settlement, empty hookData |
| PSM | Registered `usdt20psm` pool selected by Router flag, both directions, with `10^12` granularity checks |
| Wrap / unwrap | Pure TRX ↔ WTRX, or entry/exit wrapping around a supported swap |
| Same-currency routes | User-paid V2/V3 routes through distinct pools; V4 net-delta loops and prepaid output/refund collisions are rejected |
| Mixed protocols, splits, Stable, HTX Sun | Rejected for Exact-Out |

Historical Router balances retain Exact-In semantics: SWEEP checks/distributes the total balance and PAY_REFERRAL charges on it. This is distinct from this transaction's refund, which must not satisfy its output minimum or enter its output referral base. Quotes must match the Router deployment. Hook-specific behavior and live deployment state still require execution validation.

V4 Exact-Out sends empty `hookData` (`0x`). Legacy Exact-In sends 20 zero bytes (`zeroAddress`); hooks may distinguish these payloads. Dynamic-fee PoolKey encoding is unit-tested, but the local V4 execution fixtures use static fees. V2 tests verify pool receipts and input/output accounting across Router payments, refunds and referrals; the controlled pools do not enforce the production pool's invariant or update reserves.

A runnable encoding example is in [examples/exact-out/encode.cjs](examples/exact-out/encode.cjs).

## Supported Exact-In Pool Types

| Pool Type | Command | Description |
|-----------|---------|-------------|
| **V1** | `V1_SWAP_EXACT_IN` | SunSwap V1 pools |
| **V2** | `V2_SWAP_EXACT_IN` | SunSwap V2 pools |
| **V3** | `V3_SWAP_EXACT_IN` | SunSwap V3 concentrated liquidity pools |
| **V4** | `V4_SWAP` | SunSwap V4 pools with hooks support |
| **Stable** | `STABLE_SWAP_EXACT_IN` | Curve-style stable pools (2pool, 3pool, etc.) |
| **PSM** | `PSM_SWAP_EXACT_IN` | Peg Stability Module pools |
| **HTX Sun** | `HTX_SUN_SWAP_IN` | HTX Sun pools |
| **WTRX** | `WRAP_ETH` / `UNWRAP_WETH` | TRX <> WTRX wrap/unwrap |

## Core API

### `TradePlanner`

The main class that converts swap routes into Universal Router commands.

```typescript
const planner = new TradePlanner(
  routes,       // SwapTradeRoute[] — one or more swap routes
  debugMode,    // boolean (default: false) — log encoding details
  options       // SwapExecutionOptions (optional)
)

planner.encode()

// Output
planner.commands  // Hex — concatenated command bytes
planner.inputs    // Hex[] — ABI-encoded parameters per command
```

#### Execution Options

```typescript
const planner = new TradePlanner([route], false, {
  permitOptions: {
    permitEnabled: true,
    permit: permit2Signature, // Permit2Signature
  },
  tradeSpiltOptions: {
    enable: true,             // Enable split routing
    oneShotTransfer: true,    // Batch transfer for split routes
  },
})
```

### `parseRouteAPIResponse`

For parsed Exact-Out routes, use `route.amountOut` for the net output target. `minimumAmountOut` exists only on Exact-In routes.

Converts a route from the Sun Router API into a `SwapTradeRoute` that `TradePlanner` can consume.

```typescript
import { parseRouteAPIResponse } from '@sun-protocol/universal-router-sdk'

const route = parseRouteAPIResponse(
  routeData,    // RouteData — single route from API response
  false,        // isTestnet
  { slippage: 0.005 } // 0.5% slippage
)
```

### Pool Constructors

```typescript
import {
  newV1Pool,
  newV2Pool,
  newV3Pool,
  newV4Pool,
  newStablePool,
  newPSMPool,
  newHTXSunPool,
  newWTRXPool,
} from '@sun-protocol/universal-router-sdk'
```

### Address Utilities

```typescript
import { toEvmHex, toBase58 } from '@sun-protocol/universal-router-sdk'

toEvmHex('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7')  // → '0x...'
toBase58('0x...')                                    // → 'T...'
```

## Project Structure

```
src/
├── core/
│   ├── TradePlanner.ts           # Main trade encoding logic
│   ├── RoutePlanner.ts           # Low-level command builder
│   ├── buildExecutionFromRoute.ts # Route → execution plan
│   ├── encodePath.ts             # Path encoding per protocol
│   ├── createCommand.ts          # ABI command encoder
│   └── parseRouteAPIResponse.ts  # Route API response parser
├── types/                        # Type definitions (Pool, Route, Command, etc.)
├── constants/                    # Contract addresses and constants
├── packages/
│   └── v4/                       # V4-specific ABIs, actions, and utilities
└── utils/
    └── addressConvert.ts         # TRON <> EVM address conversion
```

## Development

```bash
npm install
npm run build        # Compile TypeScript
npm run lint         # Type-check without emitting
npm run test         # Run tests
```

## License

MIT

### V1 Exact-Out contract compatibility

V1 Exact-Out requires the Router implementation at `4fbc87557dcddbe3031409ab65561035eb292ac6`
(or a compatible deployment). SDK support alone does not establish deployment support.
The local QS currently disables V1 Exact-Out; it must separately enable compatible quotes.

The SDK accepts two endpoints or an explicit Token→TRX→Token route and encodes
`V1_SWAP_EXACT_OUT(recipient=Router, grossAmountOut, maximumAmountIn, [input, output], payerIsUser)`.
Other intermediates, longer paths, repeated pools and output/refund currency collisions
are rejected. The contract performs the Token→Token TRX bridge internally.
TRX/WTRX pairs retain wrapping semantics.

Native input sends the maximum budget as callValue. ERC20 input is pulled into the
Router using Permit2 for the on-chain computed requirement; any unconsumed input is
swept to recipient after output distribution. Output referral is charged before the
net-target SWEEP, followed by an input refund SWEEP with minimum zero. Input referral
remains unsupported. V1 evidence uses actual Router/Permit2 with controlled exchanges
that transfer actual input and output, not deployed production pools.
