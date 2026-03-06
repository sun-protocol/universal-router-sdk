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

## Supported Pool Types

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
