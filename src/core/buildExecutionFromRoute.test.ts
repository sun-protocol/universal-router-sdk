import { describe, expect, it } from 'vitest'
import { Currency, ExactInSwapTradeRoute, newV2Pool } from '../types'
import { buildExecutionFromRoute } from './buildExecutionFromRoute'

const A = new Currency('0x1000000000000000000000000000000000000000')
const B = new Currency('0x2000000000000000000000000000000000000000')
const C = new Currency('0x3000000000000000000000000000000000000000')
const D = new Currency('0x4000000000000000000000000000000000000000')

describe('buildExecutionFromRoute', () => {
  it('rejects a route whose adjacent pools are disconnected', () => {
    const route: ExactInSwapTradeRoute = {
      pools: [newV2Pool(A, B), newV2Pool(C, D)],
      input: A,
      output: D,
      amountIn: 1n,
      minimumAmountOut: 1n,
    }

    expect(() => buildExecutionFromRoute(route)).toThrow('not connected')
  })
})
