const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')

module.exports = {
  id: 'wrap-trx-wtrx',
  description: 'Live Nile pure TRX→WTRX Exact-Out and excess callValue refund',
  recipient: env => env.NILE_RECIPIENT,
  buildQuote() {
    const target = 100_000n, maximum = 101_000n
    this.lastQuote = { protocol: 'wtrx', conversion: '1:1' }
    return buildExactOutQuote({
      tokens: [nile.tokens.trx, nile.wtrx], symbols: ['TRX', 'WTRX'],
      poolVersions: ['v2'], poolFees: ['0'], amountOutRaw: target,
      stepAmountsInRaw: [target], stepAmountsOutRaw: [target], amountInMaximumRaw: maximum,
    })
  },
  async beforeExecute({ tronWeb, encoded }) {
    this.snapshot = { recipientWtrx: await tokenBalance(tronWeb, nile.wtrx, encoded.recipient),
      payerTrx: await trxBalance(tronWeb, tronWeb.defaultAddress.base58),
      routerWtrx: await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter) }
  },
  async afterExecute({ tronWeb, encoded, receipt }) {
    const outputReceived = await tokenBalance(tronWeb, nile.wtrx, encoded.recipient) - this.snapshot.recipientWtrx
    const trxSpent = this.snapshot.payerTrx - await trxBalance(tronWeb, tronWeb.defaultAddress.base58) - BigInt(receipt.fee ?? 0)
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.equal(outputReceived, target)
    assert.equal(trxSpent, target)
    assert.equal(await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter), this.snapshot.routerWtrx)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { outputReceived, trxSpentExcludingFee: trxSpent,
      refundedCallValue: BigInt(encoded.quote.amountInMaximumRaw) - target,
      routerWtrxBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}
