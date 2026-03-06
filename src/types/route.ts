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

export interface SwapTradeRoute {
  pools: Pool[]
  input: Currency
  output: Currency
  amountIn: bigint
  minimumAmountOut: bigint
  recipient?: Address
}

export interface SwapExecutionPlan {
  path: Currency[]

  input: Currency

  output: Currency

  amountIn: bigint

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
}

export interface PermitOptions {
  permitEnabled: boolean
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
