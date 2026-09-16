const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteTokenToNative } = require('../src/nile-v1.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'v1-usdt-trx',
  description: 'Live Nile V1 ERC20 USDT→TRX Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n // 0.1 TRX
    const quote = await quoteTokenToNative(nile.tokens.usdt, target)
    this.lastQuote = { protocol: 'v1', exchange: quote.exchange, amountIn: quote.amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.usdt, nile.tokens.trx], symbols: ['USDT', 'TRX'],
      poolVersions: ['v1'], poolFees: ['0'], amountOutRaw: target,
      stepAmountsInRaw: [quote.amountIn], stepAmountsOutRaw: [target],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
  async prepare({ encoded, env }) {
    return preparePermit2(env, nile.tokens.usdt, BigInt(encoded.quote.amountInMaximumRaw))
  },
  async beforeExecute({ tronWeb, encoded }) {
    const owner = tronWeb.defaultAddress.base58
    this.snapshot = {
      ownerInput: await tokenBalance(tronWeb, nile.tokens.usdt, owner),
      recipientTrx: await trxBalance(tronWeb, encoded.recipient),
      routerInput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded, receipt }) {
    const owner = tronWeb.defaultAddress.base58
    const inputSpent = this.snapshot.ownerInput - await tokenBalance(tronWeb, nile.tokens.usdt, owner)
    const rawTrxDelta = await trxBalance(tronWeb, encoded.recipient) - this.snapshot.recipientTrx
    const payerIsRecipient = owner === encoded.recipient
    const outputReceived = rawTrxDelta + (payerIsRecipient ? BigInt(receipt.fee ?? 0) : 0n)
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(inputSpent > 0n && inputSpent <= BigInt(encoded.quote.amountInMaximumRaw), 'input budget')
    assert.ok(outputReceived >= target, `recipient TRX output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerInput)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { inputSpent, outputReceived, target, transactionFeeAddedBack: payerIsRecipient,
      routerInputBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}
