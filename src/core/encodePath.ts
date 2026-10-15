import { Hex, encodePacked } from 'viem'
import { PoolType, StablePool, V3Pool, Currency, RouteType, SwapSection, PSMPool, HTXSunPool } from '../types'
import { nextCurrency } from './routePath'

export function encodeV1RouteToPath(section: SwapSection): Hex[] {
  if (section.type !== RouteType.V1) {
    throw new Error('Section type is not V1')
  }

  return [section.currencyInput.hex, section.currencyOutput.hex]
}

export function encodeV2RouteToPath(section: SwapSection): Hex[] {
  if (section.type !== RouteType.V2) {
    throw new Error('Section type is not V2')
  }

  const input = section.currencyInput
  const output = section.currencyOutput

  const path = [input]

  for (const pool of section.pools) {
    path.push(nextCurrency(pool, path[path.length - 1]))
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return path.map(currency => currency.hex)
}

export function encodeV3RouteToPath(section: SwapSection, exactOutput = false): {
  encodedPath: Hex
  path: (number | string)[]
  types: string[]
} {
  if (section.type !== RouteType.V3) {
    throw new Error('Section type is not V3')
  }

  const input = section.currencyInput
  const output = section.currencyOutput

  const path = [] as (number | string)[]
  const types = [] as string[]

  let inputToken = section.currencyInput

  for (let i = 0; i < section.pools.length; i++) {
    const outputToken = nextCurrency(section.pools[i], inputToken)

    const fee = (section.pools[i] as V3Pool).fee
    if (i === 0) {
      types.push('address', 'uint24', 'address')
      path.push(inputToken.hex, fee, outputToken.hex)
    } else {
      types.push('uint24', 'address')
      path.push(fee, outputToken.hex)
    }

    inputToken = outputToken
  }

  if ((path[0] as string) != input.hex) {
    throw new Error('The first currency is not the input')
  }

  if ((path[path.length - 1] as string) != output.hex) {
    throw new Error('The last currency is not the output')
  }

  if (exactOutput) {
    types.reverse()
    path.reverse()
  }
  const encodedPath = encodePacked(types, path)
  return { encodedPath, path, types }
}

export function encodeStableRouteToPathAndFlags(section: SwapSection): { path: Hex[]; flags: bigint[] } {
  if (section.type !== RouteType.STABLE) {
    throw new Error('Section type is not Stable')
  }
  const input = section.currencyInput
  const output = section.currencyOutput

  const path: Currency[] = [input]
  const flags: bigint[] = []
  for (let pool of section.pools) {
    pool = pool as StablePool
    if (pool.type !== PoolType.STABLE) {
      throw new Error('Pool must be a Stable pool')
    }
    path.push(nextCurrency(pool, path[path.length - 1]))
    flags.push(BigInt(pool.flag))
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return { path: path.map(currency => currency.hex), flags }
}

export function encodePSMSwapToPathAndFlags(section: SwapSection): { path: Hex[]; flags: bigint[] } {
  if (section.type !== RouteType.PSM) {
    throw new Error('Section type is not PSM')
  }

  const input = section.currencyInput
  const output = section.currencyOutput

  const path: Currency[] = [input]
  const flags: bigint[] = []
  for (let pool of section.pools) {
    pool = pool as PSMPool
    if (pool.type !== PoolType.PSM) {
      throw new Error('Pool must be a PSM pool')
    }
    path.push(nextCurrency(pool, path[path.length - 1]))
    flags.push(BigInt(pool.flag))
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return { path: path.map(currency => currency.hex), flags }
}

export function encodeHTXSunSwapToPathAndFlags(section: SwapSection): { path: Hex[]; flags: bigint[] } {
  if (section.type !== RouteType.HTX_SUN) {
    throw new Error('Section type is not HTX Sun')
  }
  const input = section.currencyInput
  const output = section.currencyOutput

  const path: Currency[] = [input]
  const flags: bigint[] = []
  for (let pool of section.pools) {
    pool = pool as HTXSunPool
    if (pool.type !== PoolType.HTX_SUN) {
      throw new Error('Pool must be a HTX Sun pool')
    }
    path.push(nextCurrency(pool, path[path.length - 1]))
    flags.push(BigInt(pool.flag))
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return { path: path.map(currency => currency.hex), flags }
}
