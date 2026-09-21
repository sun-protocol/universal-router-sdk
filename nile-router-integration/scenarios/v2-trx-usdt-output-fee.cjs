const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote, grossTarget } = require('../src/qs-exact-out.cjs')
const { quoteV2ExactOut } = require('../src/nile-v2.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')
const { withOutputReferralAssertions } = require('../src/referral-assertions.cjs')

module.exports = withOutputReferralAssertions({
  id: 'v2-trx-usdt-output-fee',
  description: 'Live Nile V2 TRX→WTRX→USDT Exact-Out with 1% output referral',
  recipient: env => env.NILE_RECIPIENT,
  referralRecipient: env => env.NILE_REFERRAL_RECIPIENT || env.NILE_RECIPIENT,
  async buildQuote() {
    const net = 100_000n, bips = 100, gross = grossTarget(net, bips)
    const quote = await quoteV2ExactOut(nile.wtrx, nile.tokens.usdt, gross)
    this.lastQuote = { protocol: 'v2', pair: quote.pair, reserveIn: quote.reserveIn,
      reserveOut: quote.reserveOut, amountIn: quote.amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
      poolVersions: ['v2', 'v2'], poolFees: ['0', '3000'], amountOutRaw: net,
      outputReferralBips: bips,
      stepAmountsInRaw: [quote.amountIn, quote.amountIn], stepAmountsOutRaw: [quote.amountIn, gross],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
  async beforeExecute({ tronWeb, encoded }) {
    this.snapshot = {
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const recipientOutput = await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient)
    const outputReceived = recipientOutput - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerOutput)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { outputReceived, target, outputSurplus: outputReceived - target,
      outputReferralRaw: encoded.quote.amountOutRawReferral,
      routerOutputBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}, nile.tokens.usdt)
