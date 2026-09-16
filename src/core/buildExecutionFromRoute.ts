import { PoolType, RouteType, SwapSection, SwapTradeRoute, SwapExecutionPlan } from '../types'
import { validateExactOutRoute, validateTradeType } from './exactOut'
import { nextCurrency } from './routePath'

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
  validateTradeType(route.tradeType)
  if (route.tradeType === 'EXACT_OUT') validateExactOutRoute(route)
  if (route.pools.length === 0) throw new Error('Route must contain at least one pool')

  const path = [route.input]
  const sections: SwapSection[] = []
  let currency = route.input
  for (const pool of route.pools) {
    const output = nextCurrency(pool, currency)
    const type = POOL_TYPE_TO_ROUTE_TYPE[pool.type]
    const section = sections[sections.length - 1]
    if (!section || section.type !== type) {
      sections.push({
        type,
        pools: [pool],
        currencyInput: currency,
        currencyOutput: output,
        isFirstSection: sections.length === 0,
        isLastSection: false,
      })
    } else {
      section.pools.push(pool)
      section.currencyOutput = output
    }
    currency = output
    path.push(currency)
  }
  sections[sections.length - 1].isLastSection = true

  if (!currency.Equal(route.output)) throw new Error('The last currency is not the output')

  const common = {
    path: path,
    input: route.input,
    output: route.output,
    amountIn: route.amountIn,
    sections: sections,
    recipient: route.recipient,
  }

  if (route.tradeType === 'EXACT_OUT') {
    const { maximumAmountIn, amountOut, grossAmountOut, outputReferralBips } = route
    return { ...common, tradeType: 'EXACT_OUT', maximumAmountIn, amountOut, grossAmountOut, outputReferralBips }
  }
  return { ...common, tradeType: route.tradeType, minimumAmountOut: route.minimumAmountOut }
}
