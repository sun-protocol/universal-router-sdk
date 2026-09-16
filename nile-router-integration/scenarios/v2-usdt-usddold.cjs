const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV2ExactOut } = require('../src/nile-v2.cjs')
const { tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'v2-usdt-usddold',
  description: 'Live Nile V2 ERC20 USDT→USDDOLD Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000_000_000_000_000n // 0.1 USDDOLD
    const quote = await quoteV2ExactOut(nile.tokens.usdt, nile.tokens.usddold, target)
    this.lastQuote = { protocol: 'v2', pair: quote.pair, reserveIn: quote.reserveIn,
      reserveOut: quote.reserveOut, amountIn: quote.amountIn }
    return buildExactOutQuote({
      tokens: [nile.tokens.usdt, nile.tokens.usddold], symbols: ['USDT', 'USDDOLD'],
      poolVersions: ['v2'], poolFees: ['3000'], amountOutRaw: target,
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
      recipientOutput: await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient),
      routerInput: await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter),
      routerOutput: await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter),
    }
  },
  async afterExecute({ tronWeb, encoded }) {
    const owner = tronWeb.defaultAddress.base58
    const ownerInput = await tokenBalance(tronWeb, nile.tokens.usdt, owner)
    const recipientOutput = await tokenBalance(tronWeb, nile.tokens.usddold, encoded.recipient)
    const inputSpent = this.snapshot.ownerInput - ownerInput
    const outputReceived = recipientOutput - this.snapshot.recipientOutput
    const target = BigInt(encoded.quote.amountOutRaw)
    assert.ok(inputSpent > 0n && inputSpent <= BigInt(encoded.quote.amountInMaximumRaw), 'input budget')
    assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usdt, nile.universalRouter), this.snapshot.routerInput)
    assert.equal(await tokenBalance(tronWeb, nile.tokens.usddold, nile.universalRouter), this.snapshot.routerOutput)
    encoded.assertions = { inputSpent, maximumInput: encoded.quote.amountInMaximumRaw,
      outputReceived, target, outputSurplus: outputReceived - target,
      routerInputBalanceUnchanged: true, routerOutputBalanceUnchanged: true }
  },
}
