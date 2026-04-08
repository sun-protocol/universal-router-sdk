export interface PoolKey {
  token0: string
  token1: string
  hooks: string
  fee: number
  parameters: string
}

export interface RouteData {
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

export interface RouterAPIResponse {
  code: number
  message: string
  data: RouteData[]
}
