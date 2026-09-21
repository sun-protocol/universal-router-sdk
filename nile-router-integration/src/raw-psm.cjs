const assert = require('node:assert/strict')
const nile = require('../config/nile.json')
const { tokenBalance } = require('./balances.cjs')
const { preparePermit2 } = require('./approvals.cjs')

function makeRawPsmExactOutScenario(spec) {
  return {
    id: spec.id,
    description: spec.description,
    expectedSimulationFailure: spec.expectedSimulationFailure,
    recipient: env => env.NILE_RECIPIENT,
    async buildQuote() {
      this.lastQuote = { protocol: 'usdt20psm', directRouterEncoding: true,
        amountIn: spec.amountIn, amountOut: spec.amountOut }
      return { tradeType: 'EXACT_OUT', amountInRaw: spec.amountIn.toString(),
        amountInMaximumRaw: spec.maximum.toString(), amountOutRaw: spec.amountOut.toString(),
        tokens: [spec.input, spec.output], poolVersions: ['usdt20psm'] }
    },
    async encode({ sdk, quote, env }) {
      const recipient = env.NILE_RECIPIENT
      if (!recipient) throw new Error(`Scenario ${spec.id} requires a recipient`)
      const planner = new sdk.RoutePlanner()
      const input = new sdk.Address(spec.input).hex
      const output = new sdk.Address(spec.output).hex
      const receiver = new sdk.Address(recipient).hex
      planner.addCommand(sdk.CommandType.PSM_SWAP_EXACT_OUT, [
        sdk.ADDRESS_THIS.hex, spec.amountOut, spec.maximum, [input, output],
        [BigInt(nile.psmPools.usdt20psm.flag)], true,
      ])
      planner.addCommand(sdk.CommandType.SWEEP, [output, receiver, spec.amountOut])
      return { planner, callValue: 0n, recipient, route: null }
    },
    async prepare({ env }) {
      return preparePermit2(env, spec.input, spec.maximum)
    },
    async beforeExecute({ tronWeb, encoded, router }) {
      const owner = tronWeb.defaultAddress.base58
      this.snapshot = { ownerInput: await tokenBalance(tronWeb, spec.input, owner),
        recipientOutput: await tokenBalance(tronWeb, spec.output, encoded.recipient),
        routerInput: await tokenBalance(tronWeb, spec.input, router),
        routerOutput: await tokenBalance(tronWeb, spec.output, router) }
    },
    async afterExecute({ tronWeb, encoded, router }) {
      const owner = tronWeb.defaultAddress.base58
      const inputSpent = this.snapshot.ownerInput - await tokenBalance(tronWeb, spec.input, owner)
      const outputReceived = await tokenBalance(tronWeb, spec.output, encoded.recipient) - this.snapshot.recipientOutput
      assert.equal(inputSpent, spec.amountIn, 'PSM rounded input')
      assert.equal(outputReceived, spec.expectedOutput ?? spec.amountOut, 'PSM actual output')
      assert.equal(await tokenBalance(tronWeb, spec.input, router), this.snapshot.routerInput)
      assert.equal(await tokenBalance(tronWeb, spec.output, router), this.snapshot.routerOutput)
      encoded.assertions = { inputSpent, outputReceived, requestedOutput: spec.amountOut,
        outputSurplus: outputReceived - spec.amountOut, routerInputBalanceUnchanged: true,
        routerOutputBalanceUnchanged: true }
    },
  }
}

module.exports = { makeRawPsmExactOutScenario }
