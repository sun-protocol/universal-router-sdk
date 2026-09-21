const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteTokenToToken } = require('../src/nile-v1.cjs')
const { tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'v1-usdt-usddold',
  description: 'MR8 V1 Exact-Out token→token USDT→USDDOLD through internal TRX',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000_000_000_000_000n
    const quote = await quoteTokenToToken(nile.tokens.usdt, nile.tokens.usddold, target)
    this.lastQuote = { protocol: 'v1', ...quote }
    return buildExactOutQuote({
      tokens: [nile.tokens.usdt, nile.tokens.trx, nile.tokens.usddold],
      symbols: ['USDT', 'TRX', 'USDDOLD'], poolVersions: ['v1', 'v1'], poolFees: ['0', '0'],
      amountOutRaw: target, stepAmountsInRaw: [quote.amountIn, quote.amountIn],
      stepAmountsOutRaw: [quote.trxRequired, target], amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n,
    })
  },
  async prepare({ encoded, env }) {
    return preparePermit2(env, nile.tokens.usdt, BigInt(encoded.quote.amountInMaximumRaw))
  },
  async beforeExecute({ tronWeb, encoded, router }) {
    const owner = tronWeb.defaultAddress.base58
    this.snapshot = { ownerInput: await tokenBalance(tronWeb, nile.tokens.usdt, owner),
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient),
      routerInput: await tokenBalance(tronWeb, nile.tokens.usdt, router),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usddold, router) }
  },
  async afterExecute({ tronWeb, encoded, router }) {
    const owner = tronWeb.defaultAddress.base58
    const inputSpent = this.snapshot.ownerInput - await tokenBalance(tronWeb, nile.tokens.usdt, owner)
    const outputReceived = await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient) - this.snapshot.recipientOutput
    assert.ok(inputSpent > 0n && inputSpent <= BigInt(encoded.quote.amountInMaximumRaw))
    assert.equal(outputReceived, BigInt(encoded.quote.amountOutRaw))
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, router), this.snapshot.routerInput)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usddold, router), this.snapshot.routerOutput)
    encoded.assertions = { inputSpent, outputReceived, routerInputBalanceUnchanged: true,
      routerOutputBalanceUnchanged: true }
  },
}
