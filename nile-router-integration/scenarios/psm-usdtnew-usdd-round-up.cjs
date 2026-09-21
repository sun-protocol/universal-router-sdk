const nile = require('../config/nile.json')
const { makeRawPsmExactOutScenario } = require('../src/raw-psm.cjs')

module.exports = makeRawPsmExactOutScenario({
  id: 'psm-usdtnew-usdd-round-up',
  description: 'MR8 PSM Exact-Out rounds non-divisible USDD target up and transfers the surplus',
  input: nile.tokens.usdtnew, output: nile.tokens.usdd,
  amountIn: 100_001n, maximum: 100_001n,
  amountOut: 100_000_000_000_000_001n,
  expectedOutput: 100_001_000_000_000_000n,
})
