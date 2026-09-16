const base = require('./v2-trx-usdt-output-fee.cjs')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV2ExactOut } = require('../src/nile-v2.cjs')

module.exports = {
  ...base,
  id: 'v2-trx-usdt',
  description: 'Live Nile V2 TRX→WTRX→USDT Exact-Out without referral',
  expectedSimulationFailure: undefined,
  async buildQuote() {
    const target = 100_000n
    const quote = await quoteV2ExactOut(nile.wtrx, nile.tokens.usdt, target)
    this.lastQuote = { protocol: 'v2', pair: quote.pair, reserveIn: quote.reserveIn,
      reserveOut: quote.reserveOut, amountIn: quote.amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
      poolVersions: ['v2', 'v2'], poolFees: ['0', '3000'], amountOutRaw: target,
      stepAmountsInRaw: [quote.amountIn, quote.amountIn], stepAmountsOutRaw: [quote.amountIn, target],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
}
