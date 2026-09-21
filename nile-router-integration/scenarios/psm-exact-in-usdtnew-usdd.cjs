const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')

module.exports = makeExactInScenario({
  id: 'psm-exact-in-usdtnew-usdd',
  description: 'MR8 PSM Exact-In USDT New→USDD v2.0',
  tokens: [nile.tokens.usdtnew, nile.tokens.usdd], symbols: ['USDT New', 'USDD v2.0'],
  poolVersions: ['usdt20psm'], poolFees: ['0'], amountIn: 100_000n,
  quote: async () => ({ amountOut: 100_000_000_000_000_000n, protocol: 'usdt20psm' }),
})
