const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteNativeToToken } = require('../src/nile-v1.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')
const assert = require('node:assert/strict')

module.exports = {
  id: 'v1-trx-usdt',
  description: 'Live Nile V1 TRX→USDT Exact-Out smoke test without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const netOutput = 100_000n // 0.1 USDT
    const { amountIn, exchange } = await quoteNativeToToken(netOutput, nile.tokens.usdt)
    this.lastQuote = { exchange, amountIn: amountIn.toString() }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.tokens.usdt],
      symbols: ['TRX', 'USDT'],
      poolVersions: ['v1'], poolFees: ['0'], amountOutRaw: netOutput,
      stepAmountsInRaw: [amountIn.toString()], stepAmountsOutRaw: [netOutput.toString()],
      // QS Exact-Out uses input + floor(input * slippageBips / 10000).
      amountInMaximumRaw: (amountIn + amountIn / 100n).toString(),
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
    const after = {
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usdt, encoded.recipient),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
    const outputReceived = after.recipientOutput - this.snapshot.recipientOutput
    assert.equal(outputReceived, BigInt(encoded.quote.amountOutRaw), 'recipient Exact-Out amount')
    assert.equal(after.routerOutput, this.snapshot.routerOutput, 'Router output-token balance')
    assert.equal(after.routerTrx, this.snapshot.routerTrx, 'Router TRX balance')
    encoded.assertions = {
      recipientOutputBefore: this.snapshot.recipientOutput,
      recipientOutputAfter: after.recipientOutput,
      outputReceived,
      routerOutputBalanceUnchanged: true,
      routerTrxBalanceUnchanged: true,
    }
  },
}
