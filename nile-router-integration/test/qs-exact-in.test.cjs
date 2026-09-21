const test = require('node:test')
const assert = require('node:assert/strict')
const { buildExactInQuote } = require('../src/qs-exact-in.cjs')

test('builds a QS Exact-In response with a trailing display fee', () => {
  const quote = buildExactInQuote({
    tokens: ['a', 'b'], poolVersions: ['v1'], poolFees: ['0'],
    amountInRaw: 100n, amountOutRaw: 200n, amountOutMinimumRaw: 198n,
  })
  assert.equal(quote.tradeType, 'EXACT_IN')
  assert.equal(quote.amountInRaw, '100')
  assert.equal(quote.amountOutMinimumRaw, '198')
  assert.deepEqual(quote.poolFees, ['0', '0'])
})

test('rejects malformed Exact-In route arrays and amounts', () => {
  const base = { tokens: ['a', 'b'], poolVersions: ['v1'], amountInRaw: 100n,
    amountOutRaw: 200n, amountOutMinimumRaw: 198n }
  assert.throws(() => buildExactInQuote({ ...base, poolVersions: [] }), /hop count/)
  assert.throws(() => buildExactInQuote({ ...base, amountOutMinimumRaw: 201n }), /amounts/)
})
