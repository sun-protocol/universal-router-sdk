function asRaw(value, name) {
  const result = typeof value === 'bigint' ? value : BigInt(value)
  if (result < 0n) throw new Error(`${name} must be non-negative`)
  return result
}

function buildExactInQuote(spec) {
  const hops = spec.tokens.length - 1
  if (hops < 1 || spec.poolVersions.length !== hops) {
    throw new Error('Route arrays do not match hop count')
  }
  if (spec.poolKeys && spec.poolKeys.length !== hops) throw new Error('poolKeys do not match hop count')
  const amountIn = asRaw(spec.amountInRaw, 'amountInRaw')
  const amountOut = asRaw(spec.amountOutRaw, 'amountOutRaw')
  const minimum = asRaw(spec.amountOutMinimumRaw, 'amountOutMinimumRaw')
  if (amountIn === 0n || amountOut === 0n || minimum > amountOut) {
    throw new Error('Invalid Exact-In amounts')
  }
  const fees = spec.poolFees?.map(String) ?? Array(hops).fill('0')
  if (fees.length !== hops) throw new Error('poolFees do not match hop count')
  const stepOut = spec.stepAmountsOutRaw?.map(String) ?? Array(hops).fill(amountOut.toString())
  if (stepOut.length !== hops || BigInt(stepOut[hops - 1]) !== amountOut) {
    throw new Error('Invalid Exact-In step output amounts')
  }
  return {
    tradeType: 'EXACT_IN',
    amountIn: amountIn.toString(), amountInRaw: amountIn.toString(),
    amountOut: amountOut.toString(), amountOutRaw: amountOut.toString(),
    amountOutMinimum: minimum.toString(), amountOutMinimumRaw: minimum.toString(),
    amountInReferralBips: 0, amountOutReferralBips: 0,
    inUsd: '0', outUsd: '0', impact: '0', fee: '0', containsUnverifiedHook: false,
    tokens: spec.tokens,
    symbols: spec.symbols ?? spec.tokens.map((_, index) => `TOKEN_${index}`),
    poolVersions: spec.poolVersions,
    poolFees: [...fees, '0'],
    poolKeys: spec.poolKeys ?? Array(hops).fill(null),
    stepAmountsOut: stepOut,
  }
}

module.exports = { buildExactInQuote }
