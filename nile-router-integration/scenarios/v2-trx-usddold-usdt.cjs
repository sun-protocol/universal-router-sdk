const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV2ExactOut } = require('../src/nile-v2.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

module.exports = {
  id: 'v2-trx-usddold-usdt',
  description: 'Live Nile V2 two-pool TRX→WTRX→USDDOLD→USDT Exact-Out',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n
    const last = await quoteV2ExactOut(nile.tokens.usddold, nile.tokens.usdt, target)
    const first = await quoteV2ExactOut(nile.wtrx, nile.tokens.usddold, last.amountIn)
    this.lastQuote = { protocol: 'v2', pools: [first.pair, last.pair],
      intermediateUSDDOLD: last.amountIn, amountIn: first.amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usddold, nile.tokens.usdt],
      symbols: ['TRX', 'WTRX', 'USDDOLD', 'USDT'],
      poolVersions: ['v2', 'v2', 'v2'], poolFees: ['0', '3000', '3000'],
      amountOutRaw: target,
      stepAmountsInRaw: [first.amountIn, first.amountIn, last.amountIn],
      stepAmountsOutRaw: [first.amountIn, last.amountIn, target],
      amountInMaximumRaw: first.amountIn + first.amountIn / 100n,
    })
  },
  async beforeExecute({ tronWeb, encoded }) {
    this.snapshot = {
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerIntermediate: await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter),
      routerWtrx: await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const outputReceived = await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient) - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerOutput)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter), this.snapshot.routerIntermediate)
    assert.equal(await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter), this.snapshot.routerWtrx)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { outputReceived, target, outputSurplus: outputReceived - target,
      routerOutputBalanceUnchanged: true, routerIntermediateBalanceUnchanged: true,
      routerWtrxBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}
