import { Hex, encodePacked } from 'viem'
import { PoolType, StablePool, V3Pool, Currency, RouteType, SwapSection, PSMPool, HTXSunPool } from '../types'

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

  let fromIndex = 0
  for (const pool of section.pools) {
    const from = path[fromIndex]
    const to = pool.currency0.Equal(from) ? pool.currency1 : pool.currency0
    path.push(to)
    fromIndex = path.length - 1
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return path.map(currency => currency.hex)
}

export function encodeV3RouteToPath(section: SwapSection): {
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
    const outputToken = section.pools[i].currency0.Equal(inputToken)
      ? section.pools[i].currency1
      : section.pools[i].currency0

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

  // const encodedPath = section.isExactOutput ? encodePacked(types.reverse(), path.reverse()) : encodePacked(types, path)
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
  let fromIndex = 0
  for (let pool of section.pools) {
    pool = pool as StablePool
    if (pool.type !== PoolType.STABLE) {
      throw new Error('Pool must be a Stable pool')
    }
    const from = path[fromIndex]
    const to = pool.currency0.Equal(from) ? pool.currency1 : pool.currency0
    path.push(to)
    flags.push(BigInt(pool.flag))
    fromIndex = path.length - 1
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
  let fromIndex = 0
  for (let pool of section.pools) {
    pool = pool as PSMPool
    if (pool.type !== PoolType.PSM) {
      throw new Error('Pool must be a PSM pool')
    }
    const from = path[fromIndex]
    const to = pool.currency0.Equal(from) ? pool.currency1 : pool.currency0
    path.push(to)
    flags.push(BigInt(pool.flag))
    fromIndex = path.length - 1
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
  let fromIndex = 0
  for (let pool of section.pools) {
    pool = pool as HTXSunPool
    if (pool.type !== PoolType.HTX_SUN) {
      throw new Error('Pool must be a HTX Sun pool')
    }
    const from = path[fromIndex]
    const to = pool.currency0.Equal(from) ? pool.currency1 : pool.currency0
    path.push(to)
    flags.push(BigInt(pool.flag))
    fromIndex = path.length - 1
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  return { path: path.map(currency => currency.hex), flags }
}
