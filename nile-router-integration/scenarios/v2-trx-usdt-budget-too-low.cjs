const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV2ExactOut } = require('../src/nile-v2.cjs')

module.exports = {
  id: 'v2-trx-usdt-budget-too-low',
  description: 'Nile V2 Exact-Out rejects an input budget one raw unit below the pool requirement',
  expectedSimulationFailure: 'amountInMaximum is one raw unit below the current V2 requirement',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n
    const quote = await quoteV2ExactOut(nile.wtrx, nile.tokens.usdt, target)
    const insufficient = quote.amountIn - 1n
    this.lastQuote = { protocol: 'v2', pair: quote.pair, requiredInput: quote.amountIn,
      suppliedMaximum: insufficient }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
      poolVersions: ['v2', 'v2'], poolFees: ['0', '3000'], amountOutRaw: target,
      stepAmountsInRaw: [insufficient, insufficient],
      stepAmountsOutRaw: [insufficient, target], amountInMaximumRaw: insufficient,
    })
  },
}
