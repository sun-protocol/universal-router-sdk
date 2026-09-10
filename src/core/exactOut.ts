import { Hex } from 'viem'
import { Address, ExactOutAmounts, PoolType, PoolFlag, RouteData, SwapTradeRoute } from '../types'
import { MAINNET_WTRX_ADDRESS, TESTNET_WTRX_ADDRESS } from '../constants/constants'
import { toBase58 } from '../utils/addressConvert'

const UINT160_MAX = (1n << 160n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const PSM_USDT = '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c'
const PSM_USDD = '0xe91a7411e56ce79e83570570f49b9fc35b7727c5'

export function validateTradeType(type: unknown): void {
  if (type !== undefined && type !== 'EXACT_IN' && type !== 'EXACT_OUT') {
    throw new Error('Unknown tradeType')
  }
}

// Exact-Out validates strictly without changing the legacy address conversion API.
export function exactOutAddress(value: string): Hex {
  if (typeof value !== 'string') throw new Error('Invalid Exact-Out address')
  const hex = /^41[0-9a-fA-F]{40}$/.test(value) ? `0x${value.slice(2)}` : value
  if (/^0x[0-9a-fA-F]{40}$/.test(hex)) return hex.toLowerCase() as Hex
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) throw new Error('Invalid Exact-Out address')
  const address = new Address(value)
  if (toBase58(address.hex) !== value) throw new Error('Invalid Exact-Out address checksum')
  return address.hex.toLowerCase() as Hex
}

function amount(value: bigint, name: string, max = UINT256_MAX, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > max) {
    throw new Error(`Invalid Exact-Out ${name}`)
  }
}

function raw(value: unknown, name: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`Invalid Exact-Out ${name}`)
  const result = BigInt(value)
  amount(result, name)
  return result
}

function bips(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= 10000) throw new Error('Invalid Exact-Out referral bips')
}

export function parseExactOutAmounts(data: RouteData): ExactOutAmounts {
  const count = data.poolVersions?.length
  if (!count || !Array.isArray(data.tokens) || data.tokens.length !== count + 1) {
    throw new Error('Invalid Exact-Out path length')
  }
  // QS appends a display-only "0" after the per-hop fees, as in Exact-In.
  if (!Array.isArray(data.poolFees) || data.poolFees.length < count) throw new Error('Missing Exact-Out pool fees')
  for (const values of [data.poolKeys, data.stepAmountsInRaw, data.stepAmountsOutRaw]) {
    if (!Array.isArray(values) || values.length !== count) throw new Error('Invalid Exact-Out step arrays')
  }
  const stepAmountsIn = data.stepAmountsInRaw!.map(value => raw(value, 'stepAmountsInRaw'))
  const stepAmountsOut = data.stepAmountsOutRaw!.map(value => raw(value, 'stepAmountsOutRaw'))
  return {
    maximumAmountIn: raw(data.amountInMaximumRaw, 'amountInMaximumRaw'),
    amountOut: raw(data.amountOutRaw, 'amountOutRaw'),
    grossAmountOut: stepAmountsOut[count - 1],
    inputReferral: raw(data.amountInRawReferral, 'amountInRawReferral'),
    outputReferral: raw(data.amountOutRawReferral, 'amountOutRawReferral'),
    inputReferralBips: data.amountInReferralBips ?? 0,
    outputReferralBips: data.amountOutReferralBips ?? 0,
    stepAmountsIn,
    stepAmountsOut,
  }
}

export function validateExactOutRoute(route: SwapTradeRoute): void {
  for (const currency of [route.input, route.output]) {
    const hex = exactOutAddress(currency.hex)
    if (currency.isNative !== (hex === '0x0000000000000000000000000000000000000000')) {
      throw new Error('Inconsistent Exact-Out native currency')
    }
  }
  const details = route.exactOut
  if (!details) throw new Error('EXACT_OUT requires exactOut amounts')
  const { maximumAmountIn, amountOut, grossAmountOut, inputReferral, outputReferral,
    inputReferralBips, outputReferralBips, stepAmountsIn, stepAmountsOut } = details
  bips(inputReferralBips)
  bips(outputReferralBips)
  if (inputReferralBips && outputReferralBips) throw new Error('Exact-Out referrals are mutually exclusive')
  amount(route.amountIn, 'amountIn', UINT256_MAX, true)
  amount(maximumAmountIn, 'maximumAmountIn', route.input.isNative ? UINT256_MAX : UINT160_MAX, true)
  amount(amountOut, 'amountOut', UINT160_MAX, true)
  amount(grossAmountOut, 'grossAmountOut', UINT256_MAX, true)
  amount(inputReferral, 'inputReferral')
  amount(outputReferral, 'outputReferral')
  const base = route.input.isNative ? maximumAmountIn : route.amountIn
  if (inputReferral !== base * BigInt(inputReferralBips) / 10000n ||
      outputReferral !== grossAmountOut * BigInt(outputReferralBips) / 10000n ||
      grossAmountOut - outputReferral < amountOut || maximumAmountIn < route.amountIn) {
    throw new Error('Inconsistent Exact-Out budget or referral amounts')
  }
  const count = route.pools.length
  if (!count || stepAmountsIn?.length !== count || stepAmountsOut?.length !== count) {
    throw new Error('Invalid Exact-Out step arrays')
  }
  if (stepAmountsIn[0] + inputReferral !== route.amountIn || stepAmountsOut[count - 1] !== grossAmountOut) {
    throw new Error('Inconsistent Exact-Out endpoint amounts')
  }
  const seen = new Set<string>()
  let currency = route.input
  let protocol: PoolType | undefined
  let swaps = 0
  let swapInput = currency
  let swapOutput = currency
  for (let i = 0; i < count; i++) {
    const pool = route.pools[i]
    const a = exactOutAddress(pool.currency0.hex)
    const b = exactOutAddress(pool.currency1.hex)
    if (a >= b || (!currency.Equal(pool.currency0) && !currency.Equal(pool.currency1))) {
      throw new Error('Invalid Exact-Out pool currencies')
    }
    const next = currency.Equal(pool.currency0) ? pool.currency1 : pool.currency0
    amount(stepAmountsIn[i], 'step input', UINT256_MAX, true)
    amount(stepAmountsOut[i], 'step output', UINT256_MAX, true)
    if (i && stepAmountsOut[i - 1] !== stepAmountsIn[i]) throw new Error('Discontinuous Exact-Out amounts')
    let key = `${pool.type}:${a}:${b}`
    if (pool.type === PoolType.WTRX) {
      const wrapped = pool.currency0.isNative ? pool.currency1 : pool.currency0
      if (!pool.currency0.isNative ||
          (!wrapped.Equal(MAINNET_WTRX_ADDRESS) && !wrapped.Equal(TESTNET_WTRX_ADDRESS)) ||
          !(i === 0 && currency.isNative || i === count - 1 && next.isNative) ||
          stepAmountsIn[i] !== stepAmountsOut[i]) throw new Error('Unsupported Exact-Out wrap boundary')
    } else {
      if (![PoolType.V2, PoolType.V3, PoolType.V4, PoolType.PSM].includes(pool.type) ||
          (protocol !== undefined && protocol !== pool.type)) throw new Error('Unsupported Exact-Out protocol mix')
      if (!swaps) swapInput = currency
      swapOutput = next
      swaps++
      protocol = pool.type
      if ((pool.type === PoolType.V2 || pool.type === PoolType.V3 || pool.type === PoolType.PSM) &&
          (currency.isNative || next.isNative)) throw new Error('Protocol requires wrapped native currency')
      if (pool.type === PoolType.V3 || pool.type === PoolType.V4) {
        if (!Number.isInteger(pool.fee) || pool.fee < 0 || pool.fee > 0xffffff) throw new Error('Invalid pool fee')
        key += `:${pool.fee}`
      }
      if (pool.type === PoolType.V3) {
        amount(stepAmountsOut[i], 'V3 output', (1n << 255n) - 1n)
      }
      if (pool.type === PoolType.V4) {
        const parameters = pool.parameters.replace(/^0x/, '')
        if (!/^[0-9a-fA-F]{64}$/.test(parameters)) throw new Error('Invalid V4 parameters')
        key += `:${exactOutAddress(pool.hooks.hex)}:${parameters.toLowerCase()}`
        amount(stepAmountsIn[i], 'V4 input', (1n << 127n) - 1n)
        amount(stepAmountsOut[i], 'V4 output', (1n << 127n) - 1n)
      }
      if (pool.type === PoolType.PSM) {
        if (swaps !== 1 || pool.flag !== PoolFlag.PSM || a !== PSM_USDT || b !== PSM_USDD) {
          throw new Error('Unsupported Exact-Out PSM pool')
        }
        const expected = currency.hex.toLowerCase() === PSM_USDT
          ? stepAmountsIn[i] * 10n ** 12n : stepAmountsIn[i] / 10n ** 12n
        if (expected !== stepAmountsOut[i] ||
            (currency.hex.toLowerCase() === PSM_USDD && stepAmountsIn[i] % 10n ** 12n !== 0n)) {
          throw new Error('Invalid PSM Exact-Out granularity')
        }
      }
    }
    if (seen.has(key)) throw new Error('Repeated Exact-Out pool')
    seen.add(key)
    currency = next
  }
  if (!currency.Equal(route.output)) throw new Error('Invalid Exact-Out output currency')
  // Bounds on values actually encoded, including the headroom above the quoted input.
  if (protocol === PoolType.V4) amount(maximumAmountIn - inputReferral, 'V4 maximum input', (1n << 128n) - 1n)
  const prepaid = route.input.isNative || inputReferralBips > 0
  if (swaps && ((swapInput.Equal(swapOutput) && (prepaid || protocol === PoolType.V4)) ||
      (prepaid && (route.input.Equal(route.output) || swapInput.Equal(route.output))))) {
    throw new Error('Unsupported Exact-Out settlement combination: output and refund overlap')
  }
  if (route.recipient) {
    const recipient = exactOutAddress(route.recipient.hex)
    if (recipient === '0x0000000000000000000000000000000000000000' ||
        recipient === '0x0000000000000000000000000000000000000002') {
      throw new Error('Exact-Out recipient must receive output outside the Router')
    }
  }
}
