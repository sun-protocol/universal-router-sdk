import { describe, expect, it } from 'vitest'
import { decodeAbiParameters, encodePacked, encodeAbiParameters, parseAbiParameters, keccak256, getAddress, Hex } from 'viem'
import { parseRouteAPIResponse } from './parseRouteAPIResponse'
import { TradePlanner } from './TradePlanner'
import { ABI_PARAMETER, CommandUsed } from './createCommand'
import { Address, CommandType, ExactInRouteData, ExactOutRouteData, ExactOutSwapTradeRoute } from '../types'
import { MAINNET_WTRX_ADDRESS, ADDRESS_THIS } from '../constants/constants'
import { ACTIONS } from '../packages/v4/constants/actions'
import { ACTIONS_ABI } from '../packages/v4/constants/actionsAbiParameters'
import exactInFixtures from './fixtures/exactIn.json'

const A = '0x1000000000000000000000000000000000000000'
const B = '0x2000000000000000000000000000000000000000'
const C = '0x3000000000000000000000000000000000000000'
const TRX = '0x0000000000000000000000000000000000000000'
const WTRX = MAINNET_WTRX_ADDRESS.hex.toLowerCase()
const recipient = new Address('0x4000000000000000000000000000000000000000')
const parameters = `0x${'00'.repeat(29)}000100`

export function quote(overrides: Partial<ExactOutRouteData> = {}): ExactOutRouteData {
  return {
    tradeType: 'EXACT_OUT', amountIn: '100', amountInRaw: '100', amountOut: '50', amountOutRaw: '50',
    amountInMaximum: '110', amountInMaximumRaw: '110',
    amountInReferralBips: 0, amountOutReferralBips: 0,
    inUsd: '0', outUsd: '0', impact: '0', fee: '0', containsUnverifiedHook: false,
    tokens: [A, B], symbols: ['A', 'B'], poolVersions: ['v2'], poolFees: ['3000'], poolKeys: [null],
    stepAmountsOut: ['50'], grossAmountOutRaw: '50',
    ...overrides,
  }
}

function exactIn(data: ExactOutRouteData, tradeType?: 'EXACT_IN'): ExactInRouteData {
  const { tradeType: _tradeType, amountInMaximum: _displayMaximum, amountInMaximumRaw: _maximum,
    grossAmountOutRaw: _grossOutput, ...common } = data
  return { ...common, tradeType, amountOutMinimum: data.amountOut, amountOutMinimumRaw: data.amountOutRaw }
}

function encode(data = quote(), options?: ConstructorParameters<typeof TradePlanner>[2]) {
  const route = parseRouteAPIResponse(data, false)
  route.recipient = recipient
  const planner = new TradePlanner([route], false, options)
  planner.encode()
  return planner
}

function commands(planner: TradePlanner) {
  return (planner.commands.slice(2).match(/../g) ?? []).map((hex, i) => {
    const type = parseInt(hex, 16) as CommandUsed
    return { type, args: decodeAbiParameters(ABI_PARAMETER[type], planner.inputs[i]) as readonly unknown[] }
  })
}

function v4(tokens = [A, B]): ExactOutRouteData {
  return quote({ tokens, poolVersions: tokens.slice(1).map(() => 'v4'), poolFees: tokens.slice(1).map(() => '0'),
    poolKeys: tokens.slice(1).map((token, i) => ({ token0: [tokens[i], token].sort()[0], token1: [tokens[i], token].sort()[1],
      fee: 0x800000, hooks: TRX, parameters })),
    grossAmountOutRaw: '50',
  })
}

describe('Exact-Out parsing and admission', () => {
  it('exposes Exact-Out amounts without the Exact-In minimum', () => {
    const route = parseRouteAPIResponse({ ...quote({ amountOutRaw: '49', amountOutReferralBips: 200 }),
      amountOutMinimumRaw: '123' } as unknown as ExactOutRouteData, false)
    expect('minimumAmountOut' in route).toBe(false)
    if (route.tradeType !== 'EXACT_OUT') throw new Error('Expected Exact-Out route')
    expect(route.amountOut).toBe(49n)
    expect(route.grossAmountOut).toBe(50n)
  })

  it('ignores QS trailing poolFees without changing the encoded swap', () => {
    const expected = encode(quote({ poolVersions: ['v3'] }))
    const actual = encode(quote({ poolVersions: ['v3'], poolFees: ['3000', '0'] }))
    expect([actual.commands, actual.inputs]).toEqual([expected.commands, expected.inputs])
    expect(() => encode(quote({ poolFees: [] }))).toThrow('pool fees')
    expect(() => encode(quote({ grossAmountOutRaw: undefined }))).toThrow('grossAmountOutRaw')
  })

  it('does not use formatted step outputs as the gross target', () => {
    const data = v4([A, B, C])
    const expected = encode(data)
    const actual = encode({ ...data, stepAmountsOut: ['unused'] })
    expect([actual.commands, actual.inputs]).toEqual([expected.commands, expected.inputs])
  })

  it.each(['WRAP', 'UNWRAP'] as const)('accepts QS v2-labelled %s boundaries', mode => {
    const entry = mode === 'WRAP'
    const data = quote({
      tokens: entry ? [TRX, WTRX, B] : [A, WTRX, TRX],
      poolVersions: ['v2', 'v2'], poolFees: entry ? ['0', '3000', '0'] : ['3000', '0', '0'],
      poolKeys: [null, null], grossAmountOutRaw: '50',
    })
    const expected = encode({ ...data, poolVersions: entry ? ['wtrx', 'v2'] : ['v2', 'wtrx'] })
    for (const tokens of [data.tokens, data.tokens.map(token => new Address(token).base58)]) {
      const actual = encode({ ...data, tokens })
      expect([actual.commands, actual.inputs, actual.callValue]).toEqual([expected.commands, expected.inputs, expected.callValue])
    }
    for (const version of ['v3', 'v4']) {
      const actual = encode({ ...data, poolVersions: entry ? [version, 'v2'] : ['v2', version] })
      expect([actual.commands, actual.inputs]).toEqual([expected.commands, expected.inputs])
    }
    expect(() => encode({ ...data, tokens: entry ? [TRX, A, B] : [A, B, TRX] })).toThrow()
    expect(() => parseRouteAPIResponse(data, true)).toThrow()
  })

  it('rejects the old QS native input referral response', () => {
    expect(() => parseRouteAPIResponse({ ...v4([TRX, B]),
      amountInRaw: '100009999', amountInMaximumRaw: '100999999',
      amountInReferralBips: 100 }, false)).toThrow('input referral is not supported')
  })

  it.each([
    { amountInMaximumRaw: undefined }, { amountInRaw: '0x64' },
    { amountOutRaw: '0' }, { grossAmountOutRaw: undefined },
    { amountInMaximumRaw: '99' }, { poolVersions: ['unknown'] },
    { tokens: [TRX, B] }, { amountInMaximumRaw: (1n << 160n).toString() },
  ])('rejects malformed quote %j', override => {
    expect(() => encode(quote(override))).toThrow()
  })

  it('rejects unknown trade types and slippage overrides', () => {
    expect(() => parseRouteAPIResponse(quote({ tradeType: 'OTHER' as never }), false)).toThrow('tradeType')
    expect(() => parseRouteAPIResponse(quote(), false, { slippageBips: 0n })).toThrow('slippage')
  })

  it('checks V4 keys against tokens and preserves real parameters', () => {
    const data = v4()
    data.poolKeys[0]!.token0 = C
    expect(() => encode(data)).toThrow('poolKey')
    expect(() => encode(v4([A, B, A]))).toThrow('Repeated')
  })

  it('rejects splits, mixes and ambiguous prepaid loops', () => {
    const route = parseRouteAPIResponse(quote(), false)
    expect(() => new TradePlanner([route, route])).toThrow('one route')
    expect(() => encode(quote(), { tradeSpiltOptions: { enable: false, oneShotTransfer: true } })).toThrow('split')
    expect(() => encode(quote({ tokens: [A, B, C], poolVersions: ['v2', 'v3'], poolFees: ['3000', '3000'],
      poolKeys: [null, null], grossAmountOutRaw: '50',
      }))).toThrow('mix')
    const loop = v4([TRX, B, C, TRX])
    expect(() => encode(loop)).toThrow('settlement combination')
  })

  it('validates manual routes as well as API routes', () => {
    const route = parseRouteAPIResponse(quote(), false)
    route.outputReferralBips = 10_000
    expect(() => new TradePlanner([route])).toThrow('referral')
  })

  it('allows a user-paid V3 loop through distinct pools', () => {
    const planner = encode(quote({ tokens: [A, B, A], poolVersions: ['v3', 'v3'], poolFees: ['500', '3000'],
      poolKeys: [null, null], grossAmountOutRaw: '50',
      }))
    expect(commands(planner).map(c => c.type)).toEqual([CommandType.V3_SWAP_EXACT_OUT, CommandType.SWEEP])
  })

  it('rejects prepayment colliding with an unwrap output', () => {
    expect(() => encode(quote({ tokens: [TRX, WTRX, B, WTRX, TRX], poolVersions: ['wtrx', 'v3', 'v3', 'wtrx'],
      poolFees: ['0', '500', '3000', '0'], poolKeys: [null, null, null, null],
      grossAmountOutRaw: '50',
      }))).toThrow()
  })

  it('enforces PSM output granularity without binding validation to deployment addresses', () => {
    const data = quote({ tokens: ['0xa614f803b6fd780986a42c78ec9c7f77e6ded13c', '0xe91a7411e56ce79e83570570f49b9fc35b7727c5'],
      poolVersions: ['usdt20psm'], amountInRaw: '1', amountInMaximumRaw: '2', amountOutRaw: '1000000000000',
      grossAmountOutRaw: '1000000000000' })
    expect(commands(encode(data))[0].type).toBe(CommandType.PSM_SWAP_EXACT_OUT)
    expect(() => encode({ ...data, grossAmountOutRaw: '999999999999', amountOutRaw: '999999999999' })).toThrow('granularity')
    expect(commands(encode({ ...data, tokens: [A, B] }))[0].type).toBe(CommandType.PSM_SWAP_EXACT_OUT)

    const reverse = quote({ tokens: [B, A], poolVersions: ['usdt20psm'], amountInRaw: '1000000000000',
      amountInMaximumRaw: '1000000000001', amountOutRaw: '1', grossAmountOutRaw: '1' })
    expect(commands(encode(reverse))[0].type).toBe(CommandType.PSM_SWAP_EXACT_OUT)
    expect(() => encode({ ...reverse, amountInRaw: '1000000000001' }))
      .toThrow('granularity')
  })
})

describe('Exact-Out commands and payments', () => {
  it.each(['wrap', 'unwrap'] as const)('encodes pure %s with only the required input', direction => {
    const wrap = direction === 'wrap'
    for (const mode of ['none', 'output'] as const) {
      const outputFee = mode === 'output'
      const data = quote({ tokens: wrap ? [TRX, WTRX] : [WTRX, TRX],
        amountInRaw: '100', amountOutRaw: outputFee ? '99' : '100',
        amountInReferralBips: 0, amountOutReferralBips: outputFee ? 100 : 0,
        grossAmountOutRaw: '100',
      })
      const outer = commands(encode(data, mode === 'none' ? undefined : {
        referralOptions: { mode, bps: 100, projectAddress: C },
      }))
      if (wrap) {
        expect(outer.find(command => command.type === CommandType.WRAP_ETH)!.args[1]).toBe(100n)
        expect(outer.some(command => command.type === CommandType.UNWRAP_WETH)).toBe(false)
        expect(outer[outer.length - 1]).toEqual({ type: CommandType.SWEEP, args: [TRX, recipient.hex, 0n] })
      } else {
        expect(outer.filter(command => command.type === CommandType.PERMIT2_TRANSFER_FROM))
          .toEqual([{ type: CommandType.PERMIT2_TRANSFER_FROM, args: [getAddress(WTRX), ADDRESS_THIS.hex, 100n] }])
        expect(outer.filter(command => command.type === CommandType.UNWRAP_WETH)).toHaveLength(1)
        expect(outer.filter(command => command.type === CommandType.SWEEP))
          .toEqual([{ type: CommandType.SWEEP, args: [TRX, recipient.hex, BigInt(data.amountOutRaw)] }])
      }
    }
  })

  it.each(exactInFixtures)('preserves the pre-change Exact-In bytes: $name', fixture => {
    const route = parseRouteAPIResponse(fixture.data, false)
    const planner = new TradePlanner(fixture.split ? [route, route] : [route], false,
      fixture.options as ConstructorParameters<typeof TradePlanner>[2])
    planner.encode()
    expect(keccak256(encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), [planner.commands, planner.inputs])))
      .toBe(fixture.hash)
  })
  it('V2 pulls actual input subject to max and sweeps the net target', () => {
    const planner = encode()
    expect(commands(planner)).toEqual([
      { type: CommandType.V2_SWAP_EXACT_OUT, args: [ADDRESS_THIS.hex, 50n, 110n, [A, B], true] },
      { type: CommandType.SWEEP, args: [B, recipient.hex, 50n] },
    ])
    expect(planner.callValue).toBe(0n)
  })

  it.each([0, 100])('rejects input referral options at %i bps before appending commands', bps => {
    const planner = new TradePlanner([parseRouteAPIResponse(quote(), false)], false, {
      referralOptions: { mode: 'input', bps, projectAddress: C },
    })
    expect(() => planner.encode()).toThrow('input referral is not supported')
    expect(planner.commands).toBe('0x')
    expect(planner.inputs).toEqual([])
  })

  it('V3 reverses tokens and fees together', () => {
    const planner = encode(quote({ tokens: [A, B, C], poolVersions: ['v3', 'v3'], poolFees: ['500', '3000'],
      poolKeys: [null, null], grossAmountOutRaw: '50',
      }))
    expect(commands(planner)[0].args[3]).toBe(encodePacked(['address', 'uint24', 'address', 'uint24', 'address'],
      [C, 3000, B, 500, A]))
  })

  it.each([[TRX, B], [A, TRX], [A, B], [A, TRX, B]])('encodes V1 Exact-Out endpoints %j', (...tokens) => {
    const planner = encode(quote({ tokens, poolVersions: tokens.slice(1).map(() => 'v1'),
      poolFees: tokens.slice(1).map(() => '0'), poolKeys: tokens.slice(1).map(() => null),
      grossAmountOutRaw: '50',
    }))
    const outer = commands(planner)
    expect(outer.map(command => command.type)).toEqual([CommandType.V1_SWAP_EXACT_OUT, CommandType.SWEEP, CommandType.SWEEP])
    expect(outer[0].args).toEqual([ADDRESS_THIS.hex, 50n, 110n, [tokens[0], tokens[tokens.length - 1]], tokens[0] !== TRX])
    expect(outer[1].args).toEqual([tokens[tokens.length - 1], recipient.hex, 50n])
    expect(outer[2].args).toEqual([tokens[0], recipient.hex, 0n])
    expect(planner.callValue).toBe(tokens[0] === TRX ? 110n : 0n)
  })

  it.each([[A, B, C], [TRX, A, B], [A, TRX, B, C], [A, TRX, A]])('rejects unsupported V1 paths %j', (...tokens) => {
    const n = tokens.length - 1
    const data = quote({ tokens, poolVersions: Array(n).fill('v1'), poolFees: Array(n).fill('0'),
      poolKeys: Array(n).fill(null), grossAmountOutRaw: '50' })
    expect(() => encode(data)).toThrow()
    const legacy = parseRouteAPIResponse(exactIn(data, 'EXACT_IN'), false)
    const exactOut = parseRouteAPIResponse(quote(), false)
    const route: ExactOutSwapTradeRoute = {
      pools: legacy.pools, input: legacy.input, output: legacy.output, amountIn: legacy.amountIn,
      recipient: legacy.recipient, tradeType: 'EXACT_OUT',
      maximumAmountIn: exactOut.maximumAmountIn, amountOut: exactOut.amountOut,
      grossAmountOut: exactOut.grossAmountOut, outputReferralBips: exactOut.outputReferralBips,
    }
    expect(() => new TradePlanner([route])).toThrow()
  })

  it.each([true, false])('preserves V1 wrap boundaries (entry=%s)', entry => {
    const planner = encode(quote({ tokens: entry ? [TRX, WTRX, B] : [A, WTRX, TRX],
      poolVersions: entry ? ['v2', 'v1'] : ['v1', 'v2'], poolFees: ['0', '0'], poolKeys: [null, null],
      grossAmountOutRaw: '50',
    }))
    const outer = commands(planner)
    expect(outer.map(command => command.type)).toEqual(entry
      ? [CommandType.WRAP_ETH, CommandType.V1_SWAP_EXACT_OUT, CommandType.SWEEP, CommandType.UNWRAP_WETH, CommandType.SWEEP]
      : [CommandType.V1_SWAP_EXACT_OUT, CommandType.UNWRAP_WETH, CommandType.SWEEP, CommandType.SWEEP])
    const swap = outer.find(command => command.type === CommandType.V1_SWAP_EXACT_OUT)!
    expect(swap.args[4]).toBe(!entry)
    expect(outer[outer.length - 1].args).toEqual([entry ? TRX : A, recipient.hex, 0n])
  })

  it('charges V1 output referral before net output and input refund', () => {
    const outer = commands(encode(quote({ poolVersions: ['v1'], amountOutRaw: '49',
      amountOutReferralBips: 200 }),
    { referralOptions: { mode: 'output', bps: 200, projectAddress: C } }))
    expect(outer.map(command => command.type)).toEqual([CommandType.V1_SWAP_EXACT_OUT,
      CommandType.PAY_REFERRAL, CommandType.SWEEP, CommandType.SWEEP])
    expect(outer[2].args).toEqual([B, recipient.hex, 49n])
  })

  it('V4 user payment settles only debt after swapping', () => {
    const outer = commands(encode(v4()))
    const [actions, params] = outer[0].args as [Hex, Hex[]]
    expect(actions).toBe('0x080c0e')
    const [swap] = decodeAbiParameters(ACTIONS_ABI[ACTIONS.CL_SWAP_EXACT_OUT_SINGLE], params[0])
    expect(swap.amountOut).toBe(50n)
    expect(swap.amountInMaximum).toBe(110n)
    expect(swap.poolKey.fee).toBe(0x800000)
    expect(swap.poolKey.parameters).toBe(parameters)
    expect(swap.hookData).toBe('0x')
    expect(decodeAbiParameters(ACTIONS_ABI[ACTIONS.SETTLE_ALL], params[1])).toEqual([A, 110n])
    expect(outer).toHaveLength(2)
  })

  it('V4 multihop uses forward pool order and each hop input currency', () => {
    const [, params] = commands(encode(v4([A, B, C])))[0].args as [Hex, Hex[]]
    const [swap] = decodeAbiParameters(ACTIONS_ABI[ACTIONS.CL_SWAP_EXACT_OUT], params[0])
    expect(swap.currencyOut).toBe(C)
    expect(swap.path.map(hop => hop.intermediateCurrency)).toEqual([A, B])
  })

  it('native V4 pays actual debt from Router and explicitly refunds TRX', () => {
    const planner = encode(v4([TRX, B]))
    const outer = commands(planner)
    expect(planner.callValue).toBe(110n)
    const [actions, params] = outer[0].args as [Hex, Hex[]]
    expect(actions).toBe('0x080b0e')
    expect(decodeAbiParameters(ACTIONS_ABI[ACTIONS.SETTLE], params[1])).toEqual([TRX, 0n, false])
    expect(outer[2]).toEqual({ type: CommandType.SWEEP, args: [TRX, recipient.hex, 0n] })
  })

  it('wraps the budget and unwraps the unused input before native refund', () => {
    const planner = encode(quote({ tokens: [TRX, WTRX, B], poolVersions: ['wtrx', 'v2'], poolFees: ['0', '3000'],
      poolKeys: [null, null], grossAmountOutRaw: '50',
      }))
    const outer = commands(planner)
    expect(outer.map(c => c.type)).toEqual([CommandType.WRAP_ETH, CommandType.V2_SWAP_EXACT_OUT,
      CommandType.SWEEP, CommandType.UNWRAP_WETH, CommandType.SWEEP])
    expect(outer[0].args).toEqual([ADDRESS_THIS.hex, 110n])
    expect(outer[1].args[4]).toBe(false)
  })

  it.each([1, 100])('rejects input referral rates from the API: %j', amountInReferralBips => {
    const override = { amountInReferralBips }
    expect(() => parseRouteAPIResponse(quote(override), false)).toThrow('input referral is not supported')
  })

  it.each(['v2', 'v3', 'v4', 'usdt20psm'])('charges output only after the %s swap and checks the net target', version => {
    const psm = version === 'usdt20psm'
    const data = quote({ ...(version === 'v4' ? v4() : {}), poolVersions: [version],
      ...(psm ? { tokens: ['0xe91a7411e56ce79e83570570f49b9fc35b7727c5',
        '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c'], amountInRaw: '50000000000000',
        amountInMaximumRaw: '55000000000000' } : {}),
      amountOutRaw: '49', amountOutReferralBips: 200 })
    const outer = commands(encode(data, { referralOptions: { mode: 'output', bps: 200, projectAddress: C } }))
    expect(outer).toHaveLength(3)
    expect(outer[1].type).toBe(CommandType.PAY_REFERRAL)
    expect(outer[1].args[2]).toBe(200n)
    expect(outer[2].type).toBe(CommandType.SWEEP)
    expect(outer[2].args[2]).toBe(49n)
  })

  it('rejects missing referral options and rolls back failed encoding', () => {
    const route = parseRouteAPIResponse(quote(), false)
    const planner = new TradePlanner([route], false, { permitOptions: { permit: {} as never } })
    planner.addCommand(CommandType.SWEEP, [A, recipient.hex, 0n])
    const before = [planner.commands, [...planner.inputs]]
    expect(() => planner.encode()).toThrow()
    expect([planner.commands, planner.inputs]).toEqual(before)
    const withFee = quote({ amountOutRaw: '49', amountOutReferralBips: 200 })
    expect(() => encode(withFee)).toThrow('match')
    expect(() => encode(withFee, { referralOptions: { mode: 'output', bps: 100, projectAddress: C } })).toThrow('match')
  })

  it('keeps default and explicit Exact-In encoding identical', () => {
    for (const data of [quote(), v4(), quote({ poolVersions: ['v3'] })]) {
      const implicitRoute = parseRouteAPIResponse(exactIn(data), false)
      const explicitRoute = parseRouteAPIResponse(exactIn(data, 'EXACT_IN'), false)
      implicitRoute.recipient = recipient
      explicitRoute.recipient = recipient
      const implicit = new TradePlanner([implicitRoute])
      const explicit = new TradePlanner([explicitRoute])
      implicit.encode()
      explicit.encode()
      expect([explicit.commands, explicit.inputs]).toEqual([implicit.commands, implicit.inputs])
    }
  })
})
