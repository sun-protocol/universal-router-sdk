const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV4ExactOut, quoteV4ExactOutPath } = require('../src/nile-v4.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

function routeKey(pool, intermediateCurrency) {
  return { intermediateCurrency, fee: pool.fee, hooks: pool.hooks,
    hookData: '0x', parameters: pool.parameters }
}

function apiKey(pool) {
  return { token0: pool.currency0, token1: pool.currency1, hooks: pool.hooks,
    fee: pool.fee, parameters: pool.parameters }
}

module.exports = {
  id: 'v4-trx-usddold-usdt',
  description: 'Live Nile V4 two-pool native TRX→USDDOLD→USDT Exact-Out',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n
    const firstPool = nile.v4Pools.trxUsddold3000
    const lastPool = nile.v4Pools.usddoldUsdt3000
    const last = await quoteV4ExactOut(lastPool, true, target)
    const full = await quoteV4ExactOutPath(nile.tokens.usdt, [
      routeKey(firstPool, nile.tokens.trx), routeKey(lastPool, nile.tokens.usddold),
    ], target)
    this.lastQuote = { protocol: 'v4', pools: [firstPool.poolId, lastPool.poolId],
      intermediateUSDDOLD: last.amountIn, amountIn: full.amountIn,
      gasEstimate: full.gasEstimate }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.tokens.usddold, nile.tokens.usdt],
      symbols: ['TRX', 'USDDOLD', 'USDT'], poolVersions: ['v4', 'v4'],
      poolFees: [firstPool.fee, lastPool.fee], poolKeys: [apiKey(firstPool), apiKey(lastPool)],
      amountOutRaw: target, stepAmountsInRaw: [full.amountIn, last.amountIn],
      stepAmountsOutRaw: [last.amountIn, target],
      amountInMaximumRaw: full.amountIn + full.amountIn / 100n,
    })
  },
  async beforeExecute({ tronWeb, encoded }) {
    this.snapshot = {
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerIntermediate: await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const outputReceived = await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient) - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerOutput)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter), this.snapshot.routerIntermediate)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { outputReceived, target, outputSurplus: outputReceived - target,
      routerOutputBalanceUnchanged: true, routerIntermediateBalanceUnchanged: true,
      routerTrxBalanceUnchanged: true }
  },
}
