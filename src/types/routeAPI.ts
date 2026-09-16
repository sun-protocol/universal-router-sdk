export interface PoolKey {
  token0: string
  token1: string
  hooks: string
  fee: number
  parameters: string
}

interface BaseRouteData {
  amountIn: string
  amountInRaw: string
  amountOut: string
  amountOutRaw: string
  inUsd: string
  outUsd: string
  impact: string
  fee: string
  containsUnverifiedHook: boolean
  tokens: string[]
  symbols: string[]
  poolFees: string[]
  poolVersions: string[]
  poolKeys: (PoolKey | null)[]
  stepAmountsOut: string[]
  amountInReferralBips?: number
  amountOutReferralBips?: number
}

/** Exact-In quote. QS may omit tradeType for this response shape. */
export interface ExactInRouteData extends BaseRouteData {
  tradeType?: 'EXACT_IN'
  amountOutMinimum: string
  amountOutMinimumRaw: string
}

/** Exact-Out quote. */
export interface ExactOutRouteData extends BaseRouteData {
  tradeType: 'EXACT_OUT'
  amountInMaximum: string
  amountInMaximumRaw: string
  grossAmountOutRaw: string
}

export type RouteData = ExactInRouteData | ExactOutRouteData

export interface RouterAPIResponse {
  code: number
  message: string
  data: RouteData[]
}
