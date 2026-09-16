const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactOutQuote } = require('./qs-exact-out.cjs')
const { tokenBalance } = require('./balances.cjs')
const { preparePermit2 } = require('./approvals.cjs')

function makePsmExactOutScenario({ id, description, input, output, symbols, amountOut, amountIn }) {
  return {
    id,
    description,
    recipient: env => env.NILE_RECIPIENT,
    buildQuote() {
      this.lastQuote = { protocol: 'usdt20psm', flag: nile.psmPools.usdt20psm.flag,
        psm: nile.psmPools.usdt20psm.psm, amountIn, amountOut }
      return buildExactOutQuote({
        tokens: [input, output], symbols, poolVersions: ['usdt20psm'], poolFees: ['0'],
        amountOutRaw: amountOut, stepAmountsInRaw: [amountIn], stepAmountsOutRaw: [amountOut],
        amountInMaximumRaw: amountIn + amountIn / 100n,
        outputGranularity: input === nile.tokens.usdtnew ? 1_000_000_000_000n : 1n,
      })
    },
    async prepare({ encoded, env }) {
      return preparePermit2(env, input, BigInt(encoded.quote.amountInMaximumRaw))
    },
    async beforeExecute({ tronWeb, encoded }) {
      const owner = tronWeb.defaultAddress.base58
      this.snapshot = {
        ownerInput: await tokenBalance(tronWeb, input, owner),
        recipientOutput: await tokenBalance(tronWeb, output, encoded.recipient),
        routerInput: await tokenBalance(tronWeb, input, nile.universalRouter),
        routerOutput: await tokenBalance(tronWeb, output, nile.universalRouter),
      }
    },
    async afterExecute({ tronWeb, encoded }) {
      const owner = tronWeb.defaultAddress.base58
      const inputSpent = this.snapshot.ownerInput - await tokenBalance(tronWeb, input, owner)
      const outputReceived = await tokenBalance(tronWeb, output, encoded.recipient) - this.snapshot.recipientOutput
      const target = BigInt(encoded.quote.amountOutRaw)
      assert.ok(inputSpent > 0n && inputSpent <= BigInt(encoded.quote.amountInMaximumRaw), 'input budget')
      assert.ok(outputReceived >= target, `recipient output ${outputReceived} is below ${target}`)
      assert.equal(await tokenBalance(tronWeb, input, nile.universalRouter), this.snapshot.routerInput)
      assert.equal(await tokenBalance(tronWeb, output, nile.universalRouter), this.snapshot.routerOutput)
      encoded.assertions = { inputSpent, outputReceived, target, outputSurplus: outputReceived - target,
        routerInputBalanceUnchanged: true, routerOutputBalanceUnchanged: true }
    },
  }
}

module.exports = { makePsmExactOutScenario }
