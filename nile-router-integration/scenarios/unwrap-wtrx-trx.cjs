const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'unwrap-wtrx-trx',
  description: 'Live Nile pure WTRX→TRX Exact-Out through Permit2',
  recipient: env => env.NILE_RECIPIENT,
  buildQuote() {
    const target = 100_000n
    this.lastQuote = { protocol: 'wtrx', conversion: '1:1' }
    return buildExactOutQuote({
      tokens: [nile.wtrx, nile.tokens.trx], symbols: ['WTRX', 'TRX'],
      poolVersions: ['v2'], poolFees: ['0'], amountOutRaw: target,
      stepAmountsInRaw: [target], stepAmountsOutRaw: [target], amountInMaximumRaw: target,
    })
  },
  async prepare({ encoded, env }) {
    return preparePermit2(env, nile.wtrx, BigInt(encoded.quote.amountInMaximumRaw))
  },
  async beforeExecute({ tronWeb, encoded }) {
    const owner = tronWeb.defaultAddress.base58
    this.snapshot = { ownerWtrx: await tokenBalance(tronWeb, nile.wtrx, owner),
      recipientTrx: await trxBalance(tronWeb, encoded.recipient),
      routerWtrx: await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter),
      routerTrx: await trxBalance(tronWeb, nile.universalRouter) }
  },
  async afterExecute({ tronWeb, encoded, receipt }) {
    const owner = tronWeb.defaultAddress.base58
    const inputSpent = this.snapshot.ownerWtrx - await tokenBalance(tronWeb, nile.wtrx, owner)
    const rawTrxDelta = await trxBalance(tronWeb, encoded.recipient) - this.snapshot.recipientTrx
    const outputReceived = rawTrxDelta + (owner === encoded.recipient ? BigInt(receipt.fee ?? 0) : 0n)
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.equal(inputSpent, target)
    assert.equal(outputReceived, target)
    assert.equal(await tokenBalance(tronWeb, nile.wtrx, nile.universalRouter), this.snapshot.routerWtrx)
    assert.equal(await trxBalance(tronWeb, nile.universalRouter), this.snapshot.routerTrx)
    encoded.assertions = { inputSpent, outputReceived,
      routerWtrxBalanceUnchanged: true, routerTrxBalanceUnchanged: true }
  },
}
