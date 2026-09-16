const base = require('./v4-trx-usdt.cjs')
const nile = require('../config/nile.json')
const { buildExactOutQuote, grossTarget } = require('../src/qs-exact-out.cjs')
const { quoteV4ExactOut } = require('../src/nile-v4.cjs')

module.exports = {
  ...base,
  id: 'v4-trx-usdt-output-fee',
  description: 'Nile V4 native TRX→USDT Exact-Out with 1% output referral',
  expectedSimulationFailure: 'Nile Router referralVault is currently unset (zero address)',
  referralRecipient: env => env.NILE_REFERRAL_RECIPIENT || env.NILE_RECIPIENT,
  async buildQuote() {
    const net = 100_000n, bips = 100, gross = grossTarget(net, bips)
    const poolKey = nile.v4Pools.trxUsdt3000Legacy
    const quote = await quoteV4ExactOut(poolKey, true, gross)
    this.lastQuote = { protocol: 'v4', poolId: poolKey.poolId, amountIn: quote.amountIn,
      gasEstimate: quote.gasEstimate }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.tokens.usdt], symbols: ['TRX', 'USDT'],
      poolVersions: ['v4'], poolFees: [poolKey.fee], poolKeys: [{
        token0: poolKey.currency0, token1: poolKey.currency1, hooks: poolKey.hooks,
        fee: poolKey.fee, parameters: poolKey.parameters,
      }],
      amountOutRaw: net, outputReferralBips: bips,
      stepAmountsInRaw: [quote.amountIn], stepAmountsOutRaw: [gross],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
}
