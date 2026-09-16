const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV3ExactOut } = require('../src/nile-v3.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

module.exports = {
  id: 'v3-trx-usdt',
  description: 'Live Nile V3 TRX→WTRX→USDT Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote(env) {
    const target = 100_000n
    const quote = await quoteV3ExactOut(env, target, 500)
    this.lastQuote = { protocol: 'v3', ...quote }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usdt], symbols: ['TRX', 'WTRX', 'USDT'],
      poolVersions: ['v2', 'v3'], poolFees: ['0', quote.fee], amountOutRaw: target,
      stepAmountsInRaw: [quote.amountIn, quote.amountIn],
      stepAmountsOutRaw: [quote.amountIn, target],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
  async beforeExecute({ tronWeb, encoded }) {
    this.snapshot = {
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerWtrx: await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const recipientOutput = await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient)
    const outputReceived = recipientOutput - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerOutput)
    assert.equal(await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter), this.snapshot.routerWtrx)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { outputReceived, target, outputSurplus: outputReceived - target,
      routerOutputBalanceUnchanged: true, routerWtrxBalanceUnchanged: true,
      routerTrxBalanceUnchanged: true }
  },
}
