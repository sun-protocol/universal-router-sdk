const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')
const { quoteExactInput } = require('../src/nile-v1.cjs')

module.exports = makeExactInScenario({
  id: 'v1-exact-in-usdt-trx',
  description: 'MR8 V1 Exact-In USDT→native TRX',
  tokens: [nile.tokens.usdt, nile.tokens.trx], symbols: ['USDT', 'TRX'],
  poolVersions: ['v1'], poolFees: ['0'], amountIn: 100_000n,
  quote: () => quoteExactInput(nile.tokens.usdt, nile.tokens.trx, 100_000n),
})
