const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')

module.exports = makeExactInScenario({
  id: 'v3-exact-in-trx-usdt',
  description: 'MR8 V3 Exact-In TRX→WTRX→USDT delivery regression',
  tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
  poolVersions: ['v3', 'v3'], poolFees: ['0', '500'], amountIn: 100_000n,
  quote: async () => ({ amountOut: 1n, method: 'positive-output system boundary' }),
  minimumAmountOut: () => 1n,
  stepAmountsOutRaw: amountOut => [100_000n, amountOut],
})
