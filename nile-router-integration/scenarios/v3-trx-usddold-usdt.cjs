const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV3ExactOut } = require('../src/nile-v3.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

module.exports = {
  id: 'v3-trx-usddold-usdt',
  description: 'Live Nile V3 two-pool TRX→WTRX→USDDOLD→USDT Exact-Out',
  recipient: env => env.NILE_RECIPIENT,
  async prepareBeforeQuote({ env }) {
    // Used only to quote the final USDDOLD→USDT hop through the same Router boundary.
    return preparePermit2(env, nile.tokens.usddold, 1_000_000_000_000_000_000n)
  },
  async buildQuote(env) {
    const target = 100_000n
    const lastRoute = { tokens: [nile.tokens.usddold, nile.tokens.usdt],
      symbols: ['USDDOLD', 'USDT'], poolVersions: ['v3'], poolFees: [100],
      initialUpper: 100_000_000_000_000_000n, maximumUpper: 10_000_000_000_000_000_000n }
    const last = await quoteV3ExactOut(env, target, 100, lastRoute)
    const fullRoute = {
      tokens: [nile.tokens.trx, nile.wtrx, nile.tokens.usddold, nile.tokens.usdt],
      symbols: ['TRX', 'WTRX', 'USDDOLD', 'USDT'],
      poolVersions: ['v2', 'v3', 'v3'], poolFees: ['0', 500, 100],
    }
    const full = await quoteV3ExactOut(env, target, 100, fullRoute)
    this.lastQuote = { protocol: 'v3', fees: [500, 100],
      intermediateUSDDOLD: last.amountIn, amountIn: full.amountIn,
      method: full.method }
    return buildExactOutQuote({ ...fullRoute, amountOutRaw: target,
      stepAmountsInRaw: [full.amountIn, full.amountIn, last.amountIn],
      stepAmountsOutRaw: [full.amountIn, last.amountIn, target],
      amountInMaximumRaw: full.amountIn + full.amountIn / 100n })
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
