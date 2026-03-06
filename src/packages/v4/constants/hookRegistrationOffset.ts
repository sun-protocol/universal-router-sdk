import { HooksRegistration } from '../types'

export const HOOKS_REGISTRATION_OFFSET: Record<keyof HooksRegistration, number> = {
  beforeInitialize: 0,
  afterInitialize: 1,
  beforeAddLiquidity: 2,
  afterAddLiquidity: 3,
  beforeRemoveLiquidity: 4,
  afterRemoveLiquidity: 5,
  beforeSwap: 6,
  afterSwap: 7,
  beforeDonate: 8,
  afterDonate: 9,
  beforeSwapReturnsDelta: 10,
  afterSwapReturnsDelta: 11,
  afterAddLiquidityReturnsDelta: 12,
  afterRemoveLiquidityReturnsDelta: 13,
}
