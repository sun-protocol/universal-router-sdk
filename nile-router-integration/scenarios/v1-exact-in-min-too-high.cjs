const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')
const { quoteExactInput } = require('../src/nile-v1.cjs')

module.exports = makeExactInScenario({
  id: 'v1-exact-in-min-too-high',
  description: 'MR8 V1 Exact-In rejects a minimum above the live output quote',
  expectedSimulationFailure: 'amountOutMinimum exceeds the current V1 output',
  tokens: [nile.tokens.trx, nile.tokens.usdt], symbols: ['TRX', 'USDT'],
  poolVersions: ['v1'], poolFees: ['0'], amountIn: 100_000n,
  quote: () => quoteExactInput(nile.tokens.trx, nile.tokens.usdt, 100_000n),
  reportedAmountOut: amountOut => amountOut + amountOut / 100n + 1n,
  minimumAmountOut: amountOut => amountOut + amountOut / 100n + 1n,
})
