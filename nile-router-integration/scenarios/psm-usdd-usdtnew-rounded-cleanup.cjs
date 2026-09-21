const nile = require('../config/nile.json')
const { makeRawPsmExactOutScenario } = require('../src/raw-psm.cjs')

module.exports = makeRawPsmExactOutScenario({
  id: 'psm-usdd-usdtnew-rounded-cleanup',
  description: 'MR8 PSM Exact-Out returns the rounded test funds through USDD→USDT New',
  input: nile.tokens.usdd, output: nile.tokens.usdtnew,
  amountIn: 100_001_000_000_000_000n, maximum: 100_001_000_000_000_000n,
  amountOut: 100_001n,
})
