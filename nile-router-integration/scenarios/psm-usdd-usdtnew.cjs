const nile = require('../config/nile.json')
const { makePsmExactOutScenario } = require('../src/nile-psm.cjs')

module.exports = makePsmExactOutScenario({
  id: 'psm-usdd-usdtnew',
  description: 'Live Nile PSM USDD v2.0→USDT New Exact-Out',
  input: nile.tokens.usdd,
  output: nile.tokens.usdtnew,
  symbols: ['USDD v2.0', 'USDT New'],
  amountIn: 100_000_000_000_000_000n,
  amountOut: 100_000n,
})
