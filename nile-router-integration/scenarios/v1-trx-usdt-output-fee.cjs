const base = require('./v1-trx-usdt.cjs')
const { buildExactOutQuote, grossTarget } = require('../src/qs-exact-out.cjs')
const { quoteNativeToToken } = require('../src/nile-v1.cjs')
const nile = require('../config/nile.json')

module.exports = {
  ...base,
  id: 'v1-trx-usdt-output-fee',
  description: 'Live Nile V1 TRX→USDT Exact-Out with 1% output referral',
  expectedSimulationFailure: 'Nile Router referralVault is currently unset (zero address)',
  referralRecipient: env => env.NILE_REFERRAL_RECIPIENT || env.NILE_RECIPIENT,
  async buildQuote() {
    const net = 100_000n, bips = 100, gross = grossTarget(net, bips)
    const { amountIn, exchange } = await quoteNativeToToken(gross, nile.tokens.usdt)
    this.lastQuote = { protocol: 'v1', exchange, amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.tokens.usdt], symbols: ['TRX', 'USDT'],
      poolVersions: ['v1'], poolFees: ['0'], amountOutRaw: net, outputReferralBips: bips,
      stepAmountsInRaw: [amountIn], stepAmountsOutRaw: [gross],
      amountInMaximumRaw: amountIn + amountIn / 100n,
    })
  },
}
