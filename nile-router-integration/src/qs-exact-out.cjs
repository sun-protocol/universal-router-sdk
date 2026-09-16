const BIPS_BASE = 10_000n

function asRaw(value, name) {
  const result = typeof value === 'bigint' ? value : BigInt(value)
  if (result < 0n) throw new Error(`${name} must be non-negative`)
  return result
}

// Mirrors QS ExactOutGrossTarget: find the smallest granularity-aligned gross
// amount whose post-referral remainder covers the requested net output.
function grossTarget(netAmount, outputReferralBips = 0, granularity = 1n) {
  const net = asRaw(netAmount, 'netAmount')
  const unit = asRaw(granularity, 'granularity')
  const bips = BigInt(outputReferralBips)
  if (net <= 0n || unit <= 0n || bips < 0n || bips >= BIPS_BASE) {
    throw new Error('Invalid Exact-Out gross target inputs')
  }
  let gross = ((net - 1n) * BIPS_BASE) / (BIPS_BASE - bips) + 1n
  gross = ((gross + unit - 1n) / unit) * unit
  while (gross - gross * bips / BIPS_BASE < net) gross += unit
  return gross
}

function buildExactOutQuote(spec) {
  const hops = spec.tokens.length - 1
  if (hops < 1 || spec.poolVersions.length !== hops || spec.stepAmountsInRaw.length !== hops ||
      spec.stepAmountsOutRaw.length !== hops) throw new Error('Route arrays do not match hop count')
  if (spec.poolKeys && spec.poolKeys.length !== hops) throw new Error('poolKeys do not match hop count')
  const outputBips = spec.outputReferralBips ?? 0
  const net = asRaw(spec.amountOutRaw, 'amountOutRaw')
  const gross = grossTarget(net, outputBips, spec.outputGranularity ?? 1n)
  const stepOut = spec.stepAmountsOutRaw.map(String)
  if (BigInt(stepOut[hops - 1]) !== gross) {
    throw new Error(`Last step output must equal QS gross target ${gross}`)
  }
  const input = asRaw(spec.stepAmountsInRaw[0], 'first step input')
  const maximum = asRaw(spec.amountInMaximumRaw, 'amountInMaximumRaw')
  if (maximum < input) throw new Error('Maximum input is below quoted input')
  const fees = spec.poolFees?.map(String) ?? Array(hops).fill('0')
  if (fees.length !== hops) throw new Error('poolFees do not match hop count')

  return {
    tradeType: 'EXACT_OUT',
    amountInMaximum: maximum.toString(),
    amountInMaximumRaw: maximum.toString(),
    amountIn: input.toString(),
    amountInRaw: input.toString(),
    amountInReferralBips: 0,
    amountInReferral: '0',
    amountInRawReferral: '0',
    amountOut: net.toString(),
    amountOutRaw: net.toString(),
    grossAmountOutRaw: gross.toString(),
    amountOutReferralBips: outputBips,
    amountOutReferral: (gross * BigInt(outputBips) / BIPS_BASE).toString(),
    amountOutRawReferral: (gross * BigInt(outputBips) / BIPS_BASE).toString(),
    inUsd: '0', outUsd: '0', impact: '0', fee: '0', containsUnverifiedHook: false,
    tokens: spec.tokens,
    symbols: spec.symbols ?? spec.tokens.map((_, index) => `TOKEN_${index}`),
    poolVersions: spec.poolVersions,
    // QS includes a final display-only fee entry; the SDK ignores it.
    poolFees: [...fees, '0'],
    poolKeys: spec.poolKeys ?? Array(hops).fill(null),
    stepAmountsOut: stepOut,
  }
}

module.exports = { BIPS_BASE, grossTarget, buildExactOutQuote }
