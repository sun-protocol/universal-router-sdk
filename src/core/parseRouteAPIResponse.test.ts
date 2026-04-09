import { describe, it, expect } from 'vitest'
import { parseRouteAPIResponse } from './parseRouteAPIResponse'
import type { RouteData } from '../types/routeAPI'

const TOKEN_A = '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c'
const TOKEN_B = '0xc9004f0a5bb2c6b15b10a0628c99d7fdeaf7bf60'

function minimalRouteData(overrides: Partial<RouteData> = {}): RouteData {
  return {
    amountIn: '0',
    amountInRaw: '0',
    amountOut: '0',
    amountOutRaw: '1000000',
    amountOutMinimum: '0',
    amountOutMinimumRaw: '',
    inUsd: '0',
    outUsd: '0',
    impact: '0',
    fee: '0',
    containsUnverifiedHook: false,
    tokens: [TOKEN_A, TOKEN_B],
    symbols: ['A', 'B'],
    poolFees: ['3000'],
    poolVersions: ['v3'],
    poolKeys: [null],
    stepAmountsOut: ['1000000'],
    ...overrides,
  }
}

describe('parseRouteAPIResponse — minimumAmountOut / slippage', () => {
  it('decimal slippage 0.005 (0.5%) on 1_000_000', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippage: 0.005,
    })
    expect(route.minimumAmountOut).toBe(995_000n)
  })

  it('decimal slippage 0 → full amountOut', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippage: 0,
    })
    expect(route.minimumAmountOut).toBe(1_000_000n)
  })

  it('slippageBips 50 (0.5%) on 1_000_000', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippageBips: 50n,
    })
    expect(route.minimumAmountOut).toBe(995_000n)
  })

  it('slippageBips 0n applies no reduction (not treated as falsy)', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippageBips: 0n,
    })
    expect(route.minimumAmountOut).toBe(1_000_000n)
  })

  it('slippageBips only (no decimal slippage) is respected', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippageBips: 100n,
    })
    expect(route.minimumAmountOut).toBe(990_000n)
  })

  it('when both set, slippageBips takes precedence', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '1000000' }), false, {
      slippage: 0.5,
      slippageBips: 50n,
    })
    expect(route.minimumAmountOut).toBe(995_000n)
  })

  it('integer division floors (small amount, no spurious +1)', () => {
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: '10' }), false, {
      slippageBips: 50n,
    })
    expect(route.minimumAmountOut).toBe(9n)
  })

  it('decimal slippage uses micro-units to limit float error vs exact rational', () => {
    const amountOut = 1_000_000n
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: amountOut.toString() }), false, {
      slippage: 0.005,
    })
    const bpsRoute = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: amountOut.toString() }), false, {
      slippageBips: 50n,
    })
    expect(route.minimumAmountOut).toBe(bpsRoute.minimumAmountOut)
  })

  it('very large amountOutRaw: no precision loss in bps path (BigInt stays exact)', () => {
    const huge = (1n << 200n) - 12345n
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: huge.toString() }), false, {
      slippageBips: 100n,
    })
    const expected = (huge * 9900n) / 10000n
    expect(route.minimumAmountOut).toBe(expected)
  })

  it('very large amountOutRaw: decimal slippage path stays exact after micro rounding', () => {
    const huge = (1n << 180n) + 7n
    const route = parseRouteAPIResponse(minimalRouteData({ amountOutRaw: huge.toString() }), false, {
      slippage: 0.01,
    })
    const micro = 10_000n
    const expected = (huge * (1_000_000n - micro)) / 1_000_000n
    expect(route.minimumAmountOut).toBe(expected)
  })

  it('rejects slippage >= 1', () => {
    expect(() =>
      parseRouteAPIResponse(minimalRouteData(), false, { slippage: 1 })
    ).toThrow(/slippage must be a decimal fraction/)
  })

  it('rejects slippageBips > 10000', () => {
    expect(() =>
      parseRouteAPIResponse(minimalRouteData(), false, { slippageBips: 10001n })
    ).toThrow(/slippageBips must be between 0 and 10000/)
  })

  it('rejects negative slippageBips', () => {
    expect(() =>
      parseRouteAPIResponse(minimalRouteData(), false, { slippageBips: -1n })
    ).toThrow(/slippageBips must be between 0 and 10000/)
  })
})
