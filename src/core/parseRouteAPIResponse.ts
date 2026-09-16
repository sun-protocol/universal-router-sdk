import { MAINNET_WTRX_ADDRESS, TESTNET_WTRX_ADDRESS, TRX_ADDRESS } from '../constants/constants'
import {
  Address,
  Currency,
  ExactInRouteData,
  ExactInSwapTradeRoute,
  ExactOutRouteData,
  ExactOutSwapTradeRoute,
  getPoolFlag,
  newHTXSunPool,
  newPSMPool,
  newStablePool,
  newV1Pool,
  newV2Pool,
  newV3Pool,
  newV4Pool,
  newWTRXPool,
  Pool,
  PoolKey, PoolVersion, RouteData,
  SwapTradeRoute
} from '../types'
import { exactOutAddress, validateExactOutRoute, validateTradeType } from './exactOut'

export interface ParseRouteOptions {
  /**
   * @deprecated Prefer {@link ParseRouteOptions.slippageBips} for deterministic slippage. Decimal values are
   * converted with `Math.round(slippage * 1e6)` and may differ from an exact rational by rounding (e.g. ±1 wei).
   */
  slippage?: number
  /**
   * Slippage in basis points, 0–10000 (e.g. 50 = 0.5%). Integer math only; use this for parity with on-chain
   * or API-defined bps. When set, this takes precedence over {@link ParseRouteOptions.slippage}.
   */
  slippageBips?: bigint
}

/**
 * Maps a single `RouteData` entry from the router API into a `SwapTradeRoute`.
 *
 * For slippage, pass {@link ParseRouteOptions.slippageBips} when possible; see deprecation on {@link ParseRouteOptions.slippage}.
 */
export function parseRouteAPIResponse(
  routeData: ExactOutRouteData,
  isTestnet: boolean,
  options?: ParseRouteOptions
): ExactOutSwapTradeRoute
export function parseRouteAPIResponse(
  routeData: ExactInRouteData,
  isTestnet: boolean,
  options?: ParseRouteOptions
): ExactInSwapTradeRoute
export function parseRouteAPIResponse(
  routeData: RouteData,
  isTestnet: boolean,
  options?: ParseRouteOptions
): SwapTradeRoute
export function parseRouteAPIResponse(
  routeData: RouteData,
  isTestnet: boolean,
  options?: ParseRouteOptions
): SwapTradeRoute {
  validateTradeType(routeData.tradeType)
  return routeData.tradeType === 'EXACT_OUT'
    ? parseExactOutRoute(routeData, isTestnet, options)
    : parseExactInRoute(routeData, isTestnet, options)
}

function parseExactInRoute(data: ExactInRouteData, isTestnet: boolean, options?: ParseRouteOptions): ExactInSwapTradeRoute {
  let minimumAmountOut: bigint = 0n
  if (data.amountOutMinimumRaw) {
    minimumAmountOut = BigInt(data.amountOutMinimumRaw)
  }
  if (options && (options.slippage != null || options.slippageBips != null)) {
    const amountOutRawBigInt = BigInt(data.amountOutRaw)

    if (options.slippageBips != null) {
      const bps = options.slippageBips
      if (bps < 0n || bps > 10_000n) {
        throw new Error('slippageBips must be between 0 and 10000')
      }
      minimumAmountOut = (amountOutRawBigInt * (10_000n - bps)) / 10_000n
    } else {
      const slippage = options.slippage ?? 0
      if (slippage < 0 || slippage >= 1) {
        throw new Error('slippage must be a decimal fraction in [0, 1), e.g. 0.005 for 0.5%')
      }
      const slippageMicro = BigInt(Math.round(slippage * 1_000_000))
      minimumAmountOut = (amountOutRawBigInt * (1_000_000n - slippageMicro)) / 1_000_000n
    }

    if (minimumAmountOut > amountOutRawBigInt) {
      minimumAmountOut = amountOutRawBigInt
    }
  }


  return {
    pools: parsePools(data, isTestnet),
    input: new Currency(data.tokens[0]),
    output: new Currency(data.tokens[data.tokens.length - 1]),
    amountIn: BigInt(data.amountInRaw),
    minimumAmountOut,
  }
}

function parseExactOutRoute(data: ExactOutRouteData, isTestnet: boolean, options?: ParseRouteOptions): ExactOutSwapTradeRoute {
  validateExactOutPayload(data)
  const fields = parseExactOutFields(data)
  if (options?.slippage != null || options?.slippageBips != null) {
    throw new Error('Exact-Out uses the quoted maximum input; slippage overrides are not supported')
  }
  const tokens = data.tokens.map(exactOutAddress)
  const wrapped = (isTestnet ? TESTNET_WTRX_ADDRESS : MAINNET_WTRX_ADDRESS).hex.toLowerCase()
  const poolKeys = data.poolVersions.map((version, i) => {
    if (!['v1', 'v2', 'v3', 'v4', 'usdt20psm', 'wtrx'].includes(version)) {
      throw new Error('Unsupported Exact-Out pool version')
    }
    const isWrapPair = (tokens[i] === TRX_ADDRESS.hex && tokens[i + 1] === wrapped) ||
      (tokens[i] === wrapped && tokens[i + 1] === TRX_ADDRESS.hex)
    if (version === 'wtrx' && !isWrapPair) throw new Error('Invalid Exact-Out wrap pair')
    const key = data.poolKeys[i]
    if (!isWrapPair && version === 'v4' && (!key ||
      exactOutAddress(key.token0) !== [tokens[i], tokens[i + 1]].sort()[0] ||
      exactOutAddress(key.token1) !== [tokens[i], tokens[i + 1]].sort()[1])) {
      throw new Error('V4 poolKey does not match route tokens')
    }
    return key ? { ...key, hooks: exactOutAddress(key.hooks) } : key
  })
  if (!/^\d+$/.test(data.amountInRaw)) throw new Error('Invalid Exact-Out amountInRaw')
  const route: ExactOutSwapTradeRoute = {
    pools: parsePools({ ...data, tokens, poolKeys }, isTestnet),
    input: new Currency(tokens[0]),
    output: new Currency(tokens[tokens.length - 1]),
    amountIn: BigInt(data.amountInRaw),
    tradeType: 'EXACT_OUT',
    ...fields,
  }
  validateExactOutRoute(route)
  return route
}

function parseExactOutFields(data: ExactOutRouteData): Pick<ExactOutSwapTradeRoute,
  'maximumAmountIn' | 'amountOut' | 'grossAmountOut' | 'outputReferralBips'> {
  const inputReferralBips = data.amountInReferralBips ?? 0
  const outputReferralBips = data.amountOutReferralBips ?? 0
  for (const bips of [inputReferralBips, outputReferralBips]) {
    if (!Number.isInteger(bips) || bips < 0 || bips >= 10_000) {
      throw new Error('Invalid Exact-Out referral bips')
    }
  }
  if (inputReferralBips !== 0) {
    throw new Error('Exact-Out input referral is not supported; use output referral')
  }
  return {
    maximumAmountIn: parseExactOutRaw(data.amountInMaximumRaw, 'amountInMaximumRaw'),
    amountOut: parseExactOutRaw(data.amountOutRaw, 'amountOutRaw'),
    grossAmountOut: parseExactOutRaw(data.grossAmountOutRaw, 'grossAmountOutRaw'),
    outputReferralBips,
  }
}

function parseExactOutRaw(value: unknown, name: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`Invalid Exact-Out ${name}`)
  return BigInt(value)
}

function validateExactOutPayload(data: ExactOutRouteData): void {
  const count = data.poolVersions?.length
  if (!count || !Array.isArray(data.tokens) || data.tokens.length !== count + 1) {
    throw new Error('Invalid Exact-Out path length')
  }
  // QS appends a display-only zero after the per-hop fees.
  if (!Array.isArray(data.poolFees) || data.poolFees.length < count) throw new Error('Missing Exact-Out pool fees')
  if (!Array.isArray(data.poolKeys) || data.poolKeys.length !== count) throw new Error('Invalid Exact-Out pool keys')
}

function parsePools(data: RouteData, isTestnet: boolean): Pool[] {
  return data.poolVersions.map((poolVersion, i) => poolVersionToPoolType({
    poolVersionStr: poolVersion,
    input: data.tokens[i],
    output: data.tokens[i + 1],
    fee: Number(data.poolFees[i]),
    poolKey: data.poolKeys[i] ?? undefined,
    isTestnet,
  }))
}

export function poolVersionToPoolType({
  poolVersionStr,
  input,
  output,
  fee,
  poolKey,
  isTestnet,
}: {
  poolVersionStr: string
  input: string
  output: string
  fee: number
  poolKey?: PoolKey
  isTestnet: boolean
}): Pool {
  let currency0 = new Currency(input)
  let currency1 = new Currency(output)
  if (currency0.hex > currency1.hex) {
    ;[currency0, currency1] = [currency1, currency0]
  }

  const wtrxAddress = isTestnet ? TESTNET_WTRX_ADDRESS : MAINNET_WTRX_ADDRESS

  // TRX/WTRX pairs take precedence over the quoted pool version for both trade types.
  if (
    (currency0.Equal(TRX_ADDRESS) && currency1.Equal(wtrxAddress)) ||
    (currency1.Equal(TRX_ADDRESS) && currency0.Equal(wtrxAddress))
  ) {
    return newWTRXPool(currency0, currency1)
  }

  const poolVersion = poolVersionStr as PoolVersion

  switch (poolVersion) {
    case PoolVersion.V1:
      return newV1Pool(currency0, currency1)
    case PoolVersion.V2:
      return newV2Pool(currency0, currency1)
    case PoolVersion.V3:
      return newV3Pool(currency0, currency1, fee)
    case PoolVersion.V4:
      if (!poolKey) {
        throw new Error('poolKey is required')
      }
      return newV4Pool(currency0, currency1, new Address(poolKey.hooks), poolKey.fee, poolKey.parameters)
    case PoolVersion.CURVE_2POOL:
    case PoolVersion.CURVE_USDD202POOL:
    case PoolVersion.CURVE_OLD3POOL:
    case PoolVersion.CURVE_OLDUSDCPOOL:
    case PoolVersion.CURVE_2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDC2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDD2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDJ2POOLTUSDUSDT:
      return newStablePool(currency0, currency1, getPoolFlag(poolVersion))
    case PoolVersion.PSM_USDT20PSM:
      return newPSMPool(currency0, currency1, getPoolFlag(poolVersion))
    case PoolVersion.HTX_SUN:
      return newHTXSunPool(currency0, currency1, getPoolFlag(poolVersion))
    case PoolVersion.WTRX:
      return newWTRXPool(currency0, currency1)
  }
}
