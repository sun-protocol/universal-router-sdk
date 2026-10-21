import { describe, expect, it } from 'vitest'
import { decodeAbiParameters, getAddress } from 'viem'
import { ADDRESS_THIS, MAINNET_WTRX_ADDRESS, TESTNET_WTRX_ADDRESS, TRX_ADDRESS } from '../constants/constants'
import {
  CommandType, Currency, ExactInSwapTradeRoute, newV1Pool, newV2Pool, newWTRXPool,
  SwapExecutionOptions,
} from '../types'
import { ABI_PARAMETER, CommandUsed } from './createCommand'
import { TradePlanner } from './TradePlanner'

const A = new Currency('0x1000000000000000000000000000000000000000')
const B = new Currency('0x2000000000000000000000000000000000000000')
const projectAddress = '0x3000000000000000000000000000000000000000'

function encode(route: ExactInSwapTradeRoute, options?: SwapExecutionOptions) {
  const planner = new TradePlanner([route], false, options)
  planner.encode()
  return (planner.commands.slice(2).match(/../g) ?? []).map((hex, index) => {
    const type = parseInt(hex, 16) as CommandUsed
    return { type, args: decodeAbiParameters(ABI_PARAMETER[type], planner.inputs[index]) }
  })
}

function entryUnwrap(wtrx: Currency): ExactInSwapTradeRoute {
  return {
    input: wtrx, output: B, amountIn: 1_000_000n, minimumAmountOut: 50n,
    pools: [newWTRXPool(TRX_ADDRESS, wtrx), newV1Pool(TRX_ADDRESS, A), newV2Pool(A, B)],
  }
}

describe('Exact-In WTRX funding', () => {
  it.each([MAINNET_WTRX_ADDRESS, TESTNET_WTRX_ADDRESS])(
    'funds an entry unwrap before the V1 and V2 swaps (%s)', wtrx => {
      const commands = encode(entryUnwrap(wtrx))
      expect(commands.map(command => command.type)).toEqual([
        CommandType.PERMIT2_TRANSFER_FROM, CommandType.UNWRAP_WETH,
        CommandType.V1_SWAP_EXACT_IN, CommandType.V2_SWAP_EXACT_IN, CommandType.SWEEP,
      ])
      expect(commands[0].args).toEqual([getAddress(wtrx.hex), ADDRESS_THIS.hex, 1_000_000n])
      expect(commands[2].args[4]).toBe(false)
    }
  )

  it('funds a pure unwrap with the exact input', () => {
    const route = entryUnwrap(MAINNET_WTRX_ADDRESS)
    const commands = encode({ ...route, output: TRX_ADDRESS, pools: route.pools.slice(0, 1) })
    expect(commands.map(command => command.type)).toEqual([
      CommandType.PERMIT2_TRANSFER_FROM, CommandType.UNWRAP_WETH, CommandType.SWEEP,
    ])
    expect(commands[0].args).toEqual([getAddress(route.input.hex), ADDRESS_THIS.hex, route.amountIn])
  })

  it.each(['oneShotTransfer', 'inputReferral'] as const)(
    'does not pull WTRX twice when funded by %s', mode => {
      const options: SwapExecutionOptions = mode === 'oneShotTransfer'
        ? { tradeSpiltOptions: { oneShotTransfer: true } }
        : { referralOptions: { mode: 'input', projectAddress, bps: 100 } }
      const commands = encode(entryUnwrap(MAINNET_WTRX_ADDRESS), options)
      expect(commands.filter(command => command.type === CommandType.PERMIT2_TRANSFER_FROM))
        .toEqual([{ type: CommandType.PERMIT2_TRANSFER_FROM,
          args: [getAddress(MAINNET_WTRX_ADDRESS.hex), ADDRESS_THIS.hex, 1_000_000n] }])
      expect(commands.map(command => command.type).slice(0, mode === 'inputReferral' ? 3 : 2))
        .toEqual(mode === 'inputReferral'
          ? [CommandType.PERMIT2_TRANSFER_FROM, CommandType.PAY_REFERRAL, CommandType.UNWRAP_WETH]
          : [CommandType.PERMIT2_TRANSFER_FROM, CommandType.UNWRAP_WETH])
    }
  )

  it('still funds an entry unwrap with output referral', () => {
    const commands = encode(entryUnwrap(MAINNET_WTRX_ADDRESS), {
      referralOptions: { mode: 'output', projectAddress, bps: 100 },
    })
    expect(commands.map(command => command.type)).toEqual([
      CommandType.PERMIT2_TRANSFER_FROM, CommandType.UNWRAP_WETH,
      CommandType.V1_SWAP_EXACT_IN, CommandType.V2_SWAP_EXACT_IN,
      CommandType.PAY_REFERRAL, CommandType.SWEEP,
    ])
  })

  it('does not pull user WTRX for an output unwrap', () => {
    const commands = encode({
      input: A, output: TRX_ADDRESS, amountIn: 100n, minimumAmountOut: 50n,
      pools: [newV2Pool(A, MAINNET_WTRX_ADDRESS), newWTRXPool(TRX_ADDRESS, MAINNET_WTRX_ADDRESS)],
    })
    expect(commands.map(command => command.type)).toEqual([
      CommandType.V2_SWAP_EXACT_IN, CommandType.UNWRAP_WETH, CommandType.SWEEP,
    ])
    expect(commands[0].args[4]).toBe(true)
  })
})
