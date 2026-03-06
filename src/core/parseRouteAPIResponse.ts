import { SwapTradeRoute, Pool, Currency, Permit2Signature, PoolKey, PoolVersion, RouteData } from '../types'
import { Decimal } from 'decimal.js'
import {
  newV1Pool,
  newV2Pool,
  newV3Pool,
  newV4Pool,
  newStablePool,
  newPSMPool,
  newHTXSunPool,
  newWTRXPool,
  getPoolFlag,
} from '../types'
import { TESTNET_WTRX_ADDRESS, MAINNET_WTRX_ADDRESS, TRX_ADDRESS } from '../constants/constants'
import { Address } from '../types'

export interface ParseRouteOptions {
  slippage?: number
}

export function parseRouteAPIResponse(
  routeData: RouteData,
  isTestnet: boolean,
  options?: ParseRouteOptions
): SwapTradeRoute {
  const pools: Pool[] = []
  for (let i = 0; i < routeData.poolVersions.length; i++) {
    const poolVersion = routeData.poolVersions[i]
    const pool = poolVersionToPoolType({
      poolVersionStr: poolVersion,
      input: routeData.tokens[i],
      output: routeData.tokens[i + 1],
      fee: Number(routeData.poolFees[i]),
      poolKey: routeData.poolKeys[i] ?? undefined,
      isTestnet: isTestnet,
    })
    pools.push(pool)
  }

  let minimumAmountOut: bigint = 0n
  if (options) {
    const slippage = options.slippage ?? 0

    const amountOutRawBigInt = BigInt(routeData.amountOutRaw)
    minimumAmountOut = (amountOutRawBigInt * BigInt(Math.floor((1 - slippage) * 1000000))) / 1000000n

    if (minimumAmountOut > amountOutRawBigInt) {
      minimumAmountOut = amountOutRawBigInt
    }
  }

  const route: SwapTradeRoute = {
    pools: pools,
    input: new Currency(routeData.tokens[0]),
    output: new Currency(routeData.tokens[routeData.tokens.length - 1]),
    amountIn: BigInt(routeData.amountInRaw),
    minimumAmountOut: minimumAmountOut,
  }

  return route
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

  //TODO: workaround for WTRX pool
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
