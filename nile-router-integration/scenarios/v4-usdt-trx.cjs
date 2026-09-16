const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { quoteV4ExactOut } = require('../src/nile-v4.cjs')
const { trxBalance, tokenBalance } = require('../src/balances.cjs')
const { preparePermit2 } = require('../src/approvals.cjs')

module.exports = {
  id: 'v4-usdt-trx',
  description: 'Live Nile V4 ERC20 USDT→native TRX Exact-Out without referral',
  recipient: env => env.NILE_RECIPIENT,
  async buildQuote() {
    const target = 100_000n
    const poolKey = nile.v4Pools.trxUsdt3000Legacy
    const quote = await quoteV4ExactOut(poolKey, false, target)
    this.lastQuote = { protocol: 'v4', poolId: poolKey.poolId, amountIn: quote.amountIn,
      gasEstimate: quote.gasEstimate }
    return buildExactOutQuote({
      tokens: [nile.tokens.usdt, nile.tokens.trx], symbols: ['USDT', 'TRX'],
      poolVersions: ['v4'], poolFees: [poolKey.fee], poolKeys: [{
        token0: poolKey.currency0, token1: poolKey.currency1, hooks: poolKey.hooks,
        fee: poolKey.fee, parameters: poolKey.parameters,
      }],
      amountOutRaw: target, stepAmountsInRaw: [quote.amountIn], stepAmountsOutRaw: [target],
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
