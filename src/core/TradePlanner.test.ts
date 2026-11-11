import { describe, expect, it } from 'vitest'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import { TradePlanner } from './TradePlanner'
import { ADDRESS_THIS, CONTRACT_BALANCE, MAINNET_WTRX_ADDRESS, TRX_ADDRESS } from '../constants/constants'
import {
  Address, Currency, newV2Pool, newV4Pool, newWTRXPool,
  SwapExecutionOptions, SwapTradeRoute,
} from '../types'

const WTRX = MAINNET_WTRX_ADDRESS
const TRX = TRX_ADDRESS
const TOKEN = new Currency('0xe91a7411e56ce79e83570570f49b9fc35b7727c5')
const RECIPIENT = new Address('0x1000000000000000000000000000000000000000')
const PROJECT = '0x2000000000000000000000000000000000000000'
const zero = new Address('0x0000000000000000000000000000000000000000')
const entryUnwrap = (): SwapTradeRoute => ({
  input: WTRX, output: TOKEN, amountIn: 1_000_000n, minimumAmountOut: 123n,
  recipient: RECIPIENT,
  pools: [newWTRXPool(TRX, WTRX), newV4Pool(TRX, TOKEN, zero, 500, `0x${'00'.repeat(29)}010000`)],
})

function encode(route = entryUnwrap(), options?: SwapExecutionOptions) {
  const planner = new TradePlanner([route], false, options)
  planner.encode()
  return planner
}

function commandBytes(planner: TradePlanner) {
  return planner.commands.slice(2).match(/../g) ?? []
}

describe('TradePlanner supported execution modes', () => {
  it.each([0, 2])('rejects %i routes before building a plan', count => {
    expect(() => new TradePlanner(Array.from({ length: count }, entryUnwrap)))
      .toThrow('exactly one route')
  })

  it('rejects multiple routes even when the split flag is disabled', () => {
    expect(() => new TradePlanner([entryUnwrap(), entryUnwrap()], false, {
      tradeSpiltOptions: { enable: false, oneShotTransfer: false },
    })).toThrow('exactly one route')
  })

  it.each([false, true])('rejects oneShotTransfer with split enable=%s', enable => {
    expect(() => new TradePlanner([entryUnwrap()], false, {
      tradeSpiltOptions: { enable, oneShotTransfer: true },
    })).toThrow('oneShotTransfer')
  })

  it('rechecks mutable options before emitting any commands', () => {
    const options = { tradeSpiltOptions: { enable: false, oneShotTransfer: false } }
    const planner = new TradePlanner([entryUnwrap()], false, options)
    options.tradeSpiltOptions.oneShotTransfer = true
    expect(() => planner.encode()).toThrow('oneShotTransfer')
    expect(planner.commands).toBe('0x')
    expect(planner.inputs).toEqual([])
  })
})

describe('TradePlanner WTRX entry funding', () => {
  it.each([undefined, { tradeSpiltOptions: { enable: false, oneShotTransfer: false } }])(
    'funds the router before entry unwrap with options %j', options => {
      const planner = encode(entryUnwrap(), options)
      expect(commandBytes(planner)).toEqual(['02', '0c', '12', '04'])
      const [token, recipient, amount] = decodeAbiParameters(
        parseAbiParameters('address token, address recipient, uint160 amount'), planner.inputs[0])
      expect(token.toLowerCase()).toBe(WTRX.hex.toLowerCase())
      expect(recipient).toBe(ADDRESS_THIS.hex)
      expect(amount).toBe(1_000_000n)
      const [, params] = decodeAbiParameters(parseAbiParameters('bytes actions, bytes[] params'), planner.inputs[2])
      expect(decodeAbiParameters(parseAbiParameters('address currency, uint256 amount, bool payerIsUser'), params[0]))
        .toEqual([TRX.hex, CONTRACT_BALANCE, false])
      const [, sweepRecipient, minimum] = decodeAbiParameters(
        parseAbiParameters('address token, address recipient, uint160 amountMin'), planner.inputs[3])
      expect(sweepRecipient).toBe(RECIPIENT.hex)
      expect(minimum).toBe(123n)
    })

  it.each(['input', 'output'] as const)('transfers exactly once with %s referral', mode => {
    const planner = encode(entryUnwrap(), { referralOptions: { mode, bps: 100, projectAddress: PROJECT } })
    expect(commandBytes(planner)).toEqual(mode === 'input'
      ? ['02', '07', '0c', '12', '04']
      : ['02', '0c', '12', '07', '04'])
  })

  it('funds a standalone WTRX to TRX unwrap', () => {
    const planner = encode({ ...entryUnwrap(), output: TRX, pools: [newWTRXPool(TRX, WTRX)] })
    expect(commandBytes(planner)).toEqual(['02', '0c', '04'])
  })

  it('does not pull WTRX for an intermediate unwrap', () => {
    const planner = encode({ ...entryUnwrap(), input: TOKEN, output: TRX,
      pools: [newV2Pool(TOKEN, WTRX), newWTRXPool(TRX, WTRX)] })
    expect(commandBytes(planner)).toEqual(['08', '0c', '04'])
    const args = decodeAbiParameters(
      parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'),
      planner.inputs[0])
    expect(args[4]).toBe(true)
  })

  it('keeps native entry wrap funded by call value', () => {
    const planner = encode({ ...entryUnwrap(), input: TRX,
      pools: [newWTRXPool(TRX, WTRX), newV2Pool(WTRX, TOKEN)] })
    expect(commandBytes(planner)).toEqual(['0b', '08', '04'])
  })

  it('lets a direct WTRX swap pull its own input', () => {
    const planner = encode({ ...entryUnwrap(), pools: [newV2Pool(WTRX, TOKEN)] })
    expect(commandBytes(planner)).toEqual(['08', '04'])
    const args = decodeAbiParameters(
      parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'),
      planner.inputs[0])
    expect(args[1]).toBe(1_000_000n)
    expect(args[4]).toBe(true)
  })
})
