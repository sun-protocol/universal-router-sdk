const base = require('./v3-trx-usdt.cjs')
const nile = require('../config/nile.json')
const { buildExactOutQuote, grossTarget } = require('../src/qs-exact-out.cjs')
const { quoteV3ExactOut } = require('../src/nile-v3.cjs')
const { withOutputReferralAssertions } = require('../src/referral-assertions.cjs')

module.exports = withOutputReferralAssertions({
  ...base,
  id: 'v3-trx-usdt-output-fee',
  description: 'Nile V3 TRX→USDT Exact-Out with 1% output referral',
  referralRecipient: env => env.NILE_REFERRAL_RECIPIENT || env.NILE_RECIPIENT,
  async buildQuote(env) {
    const net = 100_000n, bips = 100, gross = grossTarget(net, bips)
    const quote = await quoteV3ExactOut(env, gross, 500)
    this.lastQuote = { protocol: 'v3', ...quote }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
      poolVersions: ['v2', 'v3'], poolFees: ['0', quote.fee], amountOutRaw: net,
      outputReferralBips: bips,
      stepAmountsInRaw: [quote.amountIn, quote.amountIn],
      stepAmountsOutRaw: [quote.amountIn, gross],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
}, nile.tokens.usdt)
