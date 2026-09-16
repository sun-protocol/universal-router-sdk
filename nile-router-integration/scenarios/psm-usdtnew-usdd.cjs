const nile = require('../config/nile.json')
const { makePsmExactOutScenario } = require('../src/nile-psm.cjs')

module.exports = makePsmExactOutScenario({
  id: 'psm-usdtnew-usdd',
  description: 'Live Nile PSM USDT New→USDD v2.0 Exact-Out',
  input: nile.tokens.usdtnew,
  output: nile.tokens.usdd,
  symbols: ['USDT New', 'USDD v2.0'],
  amountIn: 100_000n,
  amountOut: 100_000_000_000_000_000n,
})
