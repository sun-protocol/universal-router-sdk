const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV3ExactOut } = require('../src/nile-v3.cjs')
const { tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'v3-usdt-usddold',
  description: 'Live Nile V3 ERC20 USDT→USDDOLD Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async prepareBeforeQuote({ env }) {
    return preparePermit2(env, nile.tokens.usdt, 1_000_000n)
  },
  async buildQuote(env) {
    const target = 100_000_000_000_000_000n
    const fee = 100
    const route = { tokens: [nile.tokens.usdt, nile.tokens.usddold],
      symbols: ['USDT', 'USDDOLD'], poolVersions: ['v3'], poolFees: [fee] }
    const quote = await quoteV3ExactOut(env, target, fee, route)
    this.lastQuote = { protocol: 'v3', ...quote }
    return buildExactOutQuote({ ...route, amountOutRaw: target,
      stepAmountsInRaw: [quote.amountIn], stepAmountsOutRaw: [target],
      amountInMaximumRaw: quote.amountIn + quote.amountIn / 100n })
  },
  async beforeExecute({ tronWeb, encoded }) {
    const owner = tronWeb.defaultAddress.base58
    this.snapshot = {
      ownerInput: await tokenBalance(tronWeb, nile.tokens.usdt, owner),
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient),
      routerInput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const owner = tronWeb.defaultAddress.base58
    const inputSpent = this.snapshot.ownerInput - await tokenBalance(tronWeb, nile.tokens.usdt, owner)
    const outputReceived = await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient) - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(inputSpent > 0n && inputSpent <= BigInt(encoded.quote.amountInMaximumRaw), 'input budget')
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerInput)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter), this.snapshot.routerOutput)
    encoded.assertions = { inputSpent, outputReceived, target, outputSurplus: outputReceived - target,
      routerInputBalanceUnchanged: true, routerOutputBalanceUnchanged: true }
  },
}
