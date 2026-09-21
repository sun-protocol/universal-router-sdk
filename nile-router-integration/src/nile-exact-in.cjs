const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { buildExactInQuote } = require('./qs-exact-in.cjs')
const { trxBalance, tokenBalance } = require('./balances.cjs')
const { preparePermit2 } = require('./approvals.cjs')

function isNative(token) {
  return token === nile.tokens.trx
}

async function balance(tronWeb, token, owner) {
  return isNative(token) ? trxBalance(tronWeb, owner) : tokenBalance(tronWeb, token, owner)
}

function makeExactInScenario(spec) {
  const input = spec.tokens[0]
  const output = spec.tokens[spec.tokens.length - 1]
  return {
    id: spec.id,
    description: spec.description,
    expectedSimulationFailure: spec.expectedSimulationFailure,
    recipient: env => env.NILE_RECIPIENT,
    callValue: () => isNative(input) ? spec.amountIn : 0n,
    async buildQuote(env) {
      const quoted = await spec.quote(env)
      const quotedOut = BigInt(quoted.amountOut)
      const reportedOut = spec.reportedAmountOut ? BigInt(spec.reportedAmountOut(quotedOut)) : quotedOut
      const minimum = spec.minimumAmountOut ? BigInt(spec.minimumAmountOut(quotedOut)) : quotedOut * 99n / 100n
      this.lastQuote = { ...quoted, amountIn: spec.amountIn, quotedOut, reportedOut, minimum }
      return buildExactInQuote({
        tokens: spec.tokens, symbols: spec.symbols, poolVersions: spec.poolVersions,
        poolFees: spec.poolFees, poolKeys: spec.poolKeys,
        amountInRaw: spec.amountIn, amountOutRaw: reportedOut, amountOutMinimumRaw: minimum,
        stepAmountsOutRaw: spec.stepAmountsOutRaw?.(reportedOut),
      })
    },
    async prepare({ encoded, env }) {
      if (isNative(input)) return { skipped: 'native input' }
      return preparePermit2(env, input, BigInt(encoded.quote.amountInRaw))
    },
    async beforeExecute({ tronWeb, encoded, router }) {
      const owner = tronWeb.defaultAddress.base58
      this.snapshot = {
        ownerInput: await balance(tronWeb, input, owner),
        recipientOutput: await balance(tronWeb, output, encoded.recipient),
        routerInput: await balance(tronWeb, input, router),
        routerOutput: await balance(tronWeb, output, router),
      }
    },
    async afterExecute({ tronWeb, encoded, receipt, router }) {
      const owner = tronWeb.defaultAddress.base58
      const fee = BigInt(receipt.fee ?? 0)
      const ownerInputAfter = await balance(tronWeb, input, owner)
      const recipientOutputAfter = await balance(tronWeb, output, encoded.recipient)
      const inputSpent = this.snapshot.ownerInput - ownerInputAfter - (isNative(input) ? fee : 0n)
      const outputReceived = recipientOutputAfter - this.snapshot.recipientOutput +
        (isNative(output) && owner === encoded.recipient ? fee : 0n)
      assert.equal(inputSpent, BigInt(encoded.quote.amountInRaw), 'Exact-In input spent')
      assert.ok(outputReceived >= BigInt(encoded.quote.amountOutMinimumRaw), 'Exact-In minimum output')
      assert.equal(await balance(tronWeb, input, router), this.snapshot.routerInput, 'Router input balance')
      assert.equal(await balance(tronWeb, output, router), this.snapshot.routerOutput, 'Router output balance')
      encoded.assertions = { inputSpent, outputReceived, minimumOutput: encoded.quote.amountOutMinimumRaw,
        routerInputBalanceUnchanged: true, routerOutputBalanceUnchanged: true }
    },
  }
}

module.exports = { makeExactInScenario }
