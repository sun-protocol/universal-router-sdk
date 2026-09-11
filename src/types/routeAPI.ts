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
  /** Exact-Out requires "0"; nonzero input referral amounts are rejected. */
  amountInRawReferral?: string
  amountOutRawReferral?: string
  stepAmountsInRaw?: string[]
  stepAmountsOutRaw?: string[]
  amountIn: string
  amountInRaw: string
  amountOut: string
  amountOutRaw: string
  /** Exact-In display minimum; may be absent or empty for Exact-Out. */
  amountOutMinimum?: string
  /** Exact-In raw minimum; Exact-Out uses amountOutRaw as its net target. */
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
  /** Exact-Out requires zero or omitted; Exact-In also supports input referral. */
  amountInReferralBips?: number
  amountOutReferralBips?: number
}

export interface RouterAPIResponse {
  code: number
  message: string
  data: RouteData[]
}
