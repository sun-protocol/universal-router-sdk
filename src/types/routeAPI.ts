export interface PoolKey {
  token0: string
  token1: string
  hooks: string
  fee: number
  parameters: string
}

export interface RouteData {
  tradeType?: 'EXACT_IN' | 'EXACT_OUT'
  amountInMaximumRaw?: string
  amountInRawReferral?: string
  amountOutRawReferral?: string
  stepAmountsInRaw?: string[]
  stepAmountsOutRaw?: string[]
  amountIn: string
  amountInRaw: string
  amountOut: string
  amountOutRaw: string
  amountOutMinimum?: string
  amountOutMinimumRaw?: string
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

export interface RouterAPIResponse {
  code: number
  message: string
  data: RouteData[]
}
