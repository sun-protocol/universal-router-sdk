const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV4ExactOut } = require('../src/nile-v4.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

module.exports = {
  id: 'v4-trx-usdt',
  description: 'Live Nile V4 native TRX→USDT Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n
    const poolKey = nile.v4Pools.trxUsdt3000Legacy
    const quote = await quoteV4ExactOut(poolKey, true, target)
    this.lastQuote = { protocol: 'v4', poolId: poolKey.poolId, amountIn: quote.amountIn,
      gasEstimate: quote.gasEstimate }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.tokens.usdt], symbols: ['TRX', 'USDT'],
      poolVersions: ['v4'], poolFees: [poolKey.fee], poolKeys: [{
        token0: poolKey.currency0, token1: poolKey.currency1, hooks: poolKey.hooks,
        fee: poolKey.fee, parameters: poolKey.parameters,
      }],
      amountOutRaw: target, stepAmountsInRaw: [quote.amountIn], stepAmountsOutRaw: [target],
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
      routerOutputBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}
