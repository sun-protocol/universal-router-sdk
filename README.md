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

Pass one `EXACT_OUT` quote from QS commit `9c1c3e5` or later. Omitted `tradeType` still means Exact-In. Exact-Out uses the quoted maximum input; do not pass a slippage override or split options.

QS's trailing `poolFees` display entry is ignored. Like Exact-In, Exact-Out treats the network-specific TRX/WTRX pair as wrapping regardless of `poolVersions`, including QS's `v2` label. The quoted execution mode must match `WRAP`/`UNWRAP`; `EXACT_OUT` cannot override pair detection.

```typescript
const route = parseRouteAPIResponse(quote, false)
route.recipient = new Address(recipientAddress) // optional; defaults to the sender
const planner = new TradePlanner([route], false, {
  // Required for a quote with a nonzero referral fee; mode and bps must match it.
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

Import `Address`, `TradePlanner`, and `parseRouteAPIResponse` from this package. For ERC20 input, approve Permit2 on the token and give the Router a Permit2 allowance. Covering `exactOut.maximumAmountIn` allows execution throughout the quoted budget; ordinary user-paid swaps only pull the actual required input. Input-referral swaps pull the budget in two parts so the slippage reserve is excluded from the fee base. V4 settles its actual debt after swapping.

For TRX input, `callValue` is the maximum total input; the input referral is calculated on this maximum, as returned by QS. Unused TRX is refunded (unused WTRX from an entry wrap is unwrapped first). **The configured recipient receives both output and refunds**, including when it differs from the payer. Create a fresh planner and call `encode()` once per transaction; repeated calls append commands.

| Exact-Out route | Encoding support |
| --- | --- |
| V1 | Not supported for Exact-Out |
| V2 / V3 | Single protocol, single or multiple distinct pools |
| V4 | Single or multiple pools through the Router's fixed Manager; actual-debt settlement, empty hookData |
| PSM | One production USDT/USDD pool (`usdt20psm`), both directions, with output granularity checks |
| Wrap / unwrap | Pure TRX ↔ WTRX, or entry/exit wrapping around a supported swap |
| Same-currency routes | User-paid V2/V3 routes through distinct pools; V4 net-delta loops and prepaid output/refund collisions are rejected |
| Mixed protocols, splits, Stable, HTX Sun | Rejected for Exact-Out |

Historical Router balances retain Exact-In semantics: SWEEP checks/distributes the total balance and PAY_REFERRAL charges on it. This is distinct from this transaction's refund, which must not satisfy its output minimum or enter its output referral base. Quotes must match the Router deployment. Hook-specific behavior and live deployment state still require execution validation.

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
