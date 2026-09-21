const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')

module.exports = makeExactInScenario({
  id: 'psm-exact-in-usdd-usdtnew',
  description: 'MR8 PSM Exact-In USDD v2.0→USDT New',
  tokens: [nile.tokens.usdd, nile.tokens.usdtnew], symbols: ['USDD v2.0', 'USDT New'],
  poolVersions: ['usdt20psm'], poolFees: ['0'], amountIn: 100_000_000_000_000_000n,
  quote: async () => ({ amountOut: 100_000n, protocol: 'usdt20psm' }),
})
