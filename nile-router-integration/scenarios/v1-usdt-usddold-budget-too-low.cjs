const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteTokenToToken } = require('../src/nile-v1.cjs')

module.exports = {
  id: 'v1-usdt-usddold-budget-too-low',
  description: 'MR8 V1 Exact-Out token→token rejects maximum input one raw unit below its live quote',
  expectedSimulationFailure: 'amountInMaximum is one raw unit below the current V1 requirement',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000_000_000_000_000n
    const quote = await quoteTokenToToken(nile.tokens.usdt, nile.tokens.usddold, target)
    const insufficient = quote.amountIn - 1n
    this.lastQuote = { protocol: 'v1', requiredInput: quote.amountIn, suppliedMaximum: insufficient }
    return buildExactOutQuote({
      tokens: [nile.tokens.usdt, nile.tokens.trx, nile.tokens.usddold],
      symbols: ['USDT', 'TRX', 'USDDOLD'], poolVersions: ['v1', 'v1'], poolFees: ['0', '0'],
      amountOutRaw: target, stepAmountsInRaw: [insufficient, insufficient],
      stepAmountsOutRaw: [quote.trxRequired, target], amountInMaximumRaw: insufficient,
    })
  },
}
