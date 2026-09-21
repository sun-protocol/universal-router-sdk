const nile = require('../config/nile.json')
const { makeExactInScenario } = require('../src/nile-exact-in.cjs')
const { quoteExactInput } = require('../src/nile-v1.cjs')

module.exports = makeExactInScenario({
  id: 'v1-exact-in-usdt-usddold',
  description: 'MR8 V1 Exact-In token→token USDT→USDDOLD through internal TRX',
  tokens: [nile.tokens.usdt, nile.tokens.trx, nile.tokens.usddold],
  symbols: ['USDT', 'TRX', 'USDDOLD'], poolVersions: ['v1', 'v1'], poolFees: ['0', '0'],
  amountIn: 100_000n,
  quote: () => quoteExactInput(nile.tokens.usdt, nile.tokens.usddold, 100_000n),
  stepAmountsOutRaw: amountOut => [amountOut, amountOut],
})
