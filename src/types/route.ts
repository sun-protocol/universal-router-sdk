import { Currency } from './currency'
import { Permit2Signature } from './permit2'
import { Address } from './address'

import { Pool, PoolType, PoolVersion } from './pool'

export enum RouteType {
  V1,
  V2,
  V3,
  V4,
  STABLE,
  PSM,
  HTX_SUN,
  WTRX,
}

export type TradeType = 'EXACT_IN' | 'EXACT_OUT'

export interface ExactOutAmounts {
  maximumAmountIn: bigint
  /** Net output target after referral fees; use for Exact-Out display and validation. */
  amountOut: bigint
  grossAmountOut: bigint
  /** Retained for quote validation; Exact-Out requires 0n. */
  inputReferral: bigint
  outputReferral: bigint
  /** Retained for quote validation; Exact-Out requires 0. */
  inputReferralBips: number
  outputReferralBips: number
  stepAmountsIn: bigint[]
  stepAmountsOut: bigint[]
}

export interface SwapTradeRoute {
  tradeType?: TradeType
  exactOut?: ExactOutAmounts
  pools: Pool[]
  input: Currency
  output: Currency
  amountIn: bigint
  /** Exact-In minimum. Parsed Exact-Out routes leave this at 0n; use exactOut.amountOut. */
  minimumAmountOut: bigint
  recipient?: Address
}

export interface SwapExecutionPlan {
  tradeType?: TradeType
  exactOut?: ExactOutAmounts
  path: Currency[]

  input: Currency

  output: Currency

  amountIn: bigint

  /** Exact-In minimum; Exact-Out encoding uses exactOut.amountOut instead. */
  minimumAmountOut: bigint

  sections: SwapSection[]

  recipient?: Address

  spiltOptions?: PlanSpiltOptions
}

export interface SwapExecutionContext {
  plans: SwapExecutionPlan[]
  options?: SwapExecutionOptions
}

export interface SwapSection {
  type: RouteType

  pools: Pool[]

  currencyInput: Currency

  currencyOutput: Currency

  isFirstSection: boolean

  isLastSection: boolean

  postSwapOptions?: PostSwapOptions
}

export interface PostSwapOptions {
  // payFee
}

export interface SwapExecutionOptions {
  permitOptions?: PermitOptions
  tradeSpiltOptions?: TradeSpiltOptions
  referralOptions?: ReferralOptions
}

export interface PermitOptions {
  /**
   * @deprecated Prefer {@link PermitOptions.disablePermit2} to control Permit2 / `payerIsUser` behavior.
   */
  permitEnabled?: boolean // default: true
  permit?: Permit2Signature
}

export interface TradeSpiltOptions {
  enable: boolean
  oneShotTransfer: boolean
}

export interface PlanSpiltOptions {
  enabled: boolean
  sequence: number
  isFirstSpilt: boolean
  isLastSpilt: boolean
}

/** Exact-Out accepts only mode: 'output'; both modes remain available for Exact-In. */
export type ReferralOptions =
  | {
      mode: 'input'
      bps: number
      projectAddress: string
    }
  | {
      mode: 'output'
      bps: number
      projectAddress: string
    }
