const test = require('node:test')
const assert = require('node:assert/strict')
const { grossTarget, buildExactOutQuote } = require('../src/qs-exact-out.cjs')

test('gross target is the smallest amount covering net output after fee', () => {
  const gross = grossTarget(1_000_000n, 100)
  assert.equal(gross, 1_010_101n)
  assert.ok(gross - gross * 100n / 10_000n >= 1_000_000n)
  const previous = gross - 1n
  assert.ok(previous - previous * 100n / 10_000n < 1_000_000n)
})

test('builds the QS Exact-Out wire shape including trailing pool fee', () => {
  const quote = buildExactOutQuote({
    tokens: ['0x1000000000000000000000000000000000000000', '0x2000000000000000000000000000000000000000'],
    poolVersions: ['v2'], poolFees: ['3000'], amountOutRaw: 100n,
    outputReferralBips: 100, stepAmountsInRaw: ['120'], stepAmountsOutRaw: ['101'],
    amountInMaximumRaw: '125',
  })
  assert.equal(quote.tradeType, 'EXACT_OUT')
  assert.equal(quote.amountInRawReferral, '0')
  assert.equal(quote.amountOutRawReferral, '1')
  assert.equal(quote.grossAmountOutRaw, '101')
  assert.equal(quote.stepAmountsInRaw, undefined)
  assert.equal(quote.stepAmountsOutRaw, undefined)
  assert.deepEqual(quote.poolFees, ['3000', '0'])
})

test('rejects inconsistent route arrays and gross output', () => {
  const base = {
    tokens: ['a', 'b'], poolVersions: ['v2'], amountOutRaw: 100n,
    stepAmountsInRaw: ['120'], stepAmountsOutRaw: ['100'], amountInMaximumRaw: '125',
  }
  assert.throws(() => buildExactOutQuote({ ...base, poolVersions: [] }), /hop count/)
  assert.throws(() => buildExactOutQuote({ ...base, outputReferralBips: 100 }), /gross target/)
})
