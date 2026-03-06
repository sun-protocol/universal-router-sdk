import { PoolType, RouteType, SwapSection, SwapTradeRoute, SwapExecutionPlan } from '../types'

const POOL_TYPE_TO_ROUTE_TYPE: Record<PoolType, RouteType> = {
  [PoolType.V1]: RouteType.V1,
  [PoolType.V2]: RouteType.V2,
  [PoolType.V3]: RouteType.V3,
  [PoolType.V4]: RouteType.V4,
  [PoolType.STABLE]: RouteType.STABLE,
  [PoolType.PSM]: RouteType.PSM,
  [PoolType.HTX_SUN]: RouteType.HTX_SUN,
  [PoolType.WTRX]: RouteType.WTRX,
}

export function buildExecutionFromRoute(route: SwapTradeRoute): SwapExecutionPlan {
  const input = route.input
  const output = route.output

  const path = [input]

  let fromIndex = 0
  for (const pool of route.pools) {
    const from = path[fromIndex]
    const to = pool.currency0.Equal(from) ? pool.currency1 : pool.currency0
    path.push(to)
    fromIndex = path.length - 1
  }

  // confirm the last currency is the output
  if (!path[path.length - 1].Equal(output)) {
    throw new Error('The last currency is not the output')
  }

  const firstPool = route.pools[0]

  const sections: SwapSection[] = []

  const sectionStep: {
    type: RouteType
    sectionIndex: number
  } = {
    type: POOL_TYPE_TO_ROUTE_TYPE[firstPool.type],
    sectionIndex: 0,
  }

  for (let i = 0; i < route.pools.length; i++) {
    const isFirstSection = i === 0
    const isLastSection = i === route.pools.length - 1
    const currentPool = route.pools[i]

    const sectionShift = i > 0 && currentPool.type !== route.pools[i - 1].type

    if (i === 0) {
      const section: SwapSection = {
        type: POOL_TYPE_TO_ROUTE_TYPE[route.pools[i].type],
        pools: [route.pools[i]],
        currencyInput: route.input,
        currencyOutput: route.input.Equal(route.pools[i].currency0)
          ? route.pools[i].currency1
          : route.pools[i].currency0,
        // isExactOutput: false,
        isFirstSection: isFirstSection,
        isLastSection: isLastSection,
      }
      sections.push(section)
    } else if (sectionShift) {
      const previousSection = sections[sectionStep.sectionIndex]
      sectionStep.sectionIndex++
      const currencyInput = previousSection.currencyOutput
      const currencyOutput = currentPool.currency0.Equal(currencyInput) ? currentPool.currency1 : currentPool.currency0
      const section: SwapSection = {
        type: POOL_TYPE_TO_ROUTE_TYPE[route.pools[i].type],
        pools: [route.pools[i]],
        currencyInput: currencyInput,
        currencyOutput: currencyOutput,
        // isExactOutput: false,
        isFirstSection: isFirstSection,
        isLastSection: isLastSection,
      }
      sections.push(section)
    } else {
      const section = sections[sectionStep.sectionIndex]
      section.pools.push(currentPool)
      section.currencyOutput = section.currencyOutput.Equal(currentPool.currency0)
        ? currentPool.currency1
        : currentPool.currency0
      section.isLastSection = isLastSection
    }
  }

  const plan: SwapExecutionPlan = {
    path: path,
    input: route.input,
    output: route.output,
    amountIn: route.amountIn,
    // amountOut: 0n, // useless for now
    // maximumAmountIn: 0n, // useless for now
    minimumAmountOut: route.minimumAmountOut,
    sections: sections,
    recipient: route.recipient,
  }

  return plan
}
