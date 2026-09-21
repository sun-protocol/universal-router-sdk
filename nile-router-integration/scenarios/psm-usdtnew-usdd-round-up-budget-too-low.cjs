const nile = require('../config/nile.json')
const { makeRawPsmExactOutScenario } = require('../src/raw-psm.cjs')

module.exports = makeRawPsmExactOutScenario({
  id: 'psm-usdtnew-usdd-round-up-budget-too-low',
  description: 'MR8 PSM Exact-Out rejects a non-divisible target without the rounded-up input unit',
  expectedSimulationFailure: 'rounded PSM input exceeds amountInMaximum by one raw unit',
  input: nile.tokens.usdtnew, output: nile.tokens.usdd,
  amountIn: 100_000n, maximum: 100_000n,
  amountOut: 100_000_000_000_000_001n,
})
