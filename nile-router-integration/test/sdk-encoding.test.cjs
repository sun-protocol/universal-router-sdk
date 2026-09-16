const test = require('node:test')
const assert = require('node:assert/strict')
const { buildExactOutQuote } = require('../src/qs-exact-out.cjs')
const { encodeScenario } = require('../src/sdk.cjs')
const nile = require('../config/nile.json')

test('passes a constructed QS response through the SDK boundary', async () => {
  const scenario = {
    recipient: () => '0x4000000000000000000000000000000000000000',
    referralRecipient: () => '0x5000000000000000000000000000000000000000',
    buildQuote: () => buildExactOutQuote({
      tokens: ['0x1000000000000000000000000000000000000000', '0x2000000000000000000000000000000000000000'],
      poolVersions: ['v2'], poolFees: ['3000'], amountOutRaw: '100',
      stepAmountsInRaw: ['120'], stepAmountsOutRaw: ['100'], amountInMaximumRaw: '125',
    }),
  }
  const encoded = await encodeScenario(scenario, {})
  assert.match(encoded.planner.commands, /^0x/)
  assert.equal(encoded.planner.callValue, 0n)
  assert.equal(encoded.route.amountOut, 100n)
})

test('encodes both directions of the supported production PSM Exact-Out pair as command 0x25', async () => {
  const cases = [
    {
      tokens: ['0xa614f803b6fd780986a42c78ec9c7f77e6ded13c', '0xe91a7411e56ce79e83570570f49b9fc35b7727c5'],
      amountIn: 1n, amountOut: 1_000_000_000_000n, outputGranularity: 1_000_000_000_000n,
    },
    {
      tokens: ['0xe91a7411e56ce79e83570570f49b9fc35b7727c5', '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c'],
      amountIn: 1_000_000_000_000n, amountOut: 1n, outputGranularity: 1n,
    },
  ]
  for (const item of cases) {
    const scenario = {
      recipient: () => '0x4000000000000000000000000000000000000000',
      buildQuote: () => buildExactOutQuote({
        tokens: item.tokens, poolVersions: ['usdt20psm'], poolFees: ['0'],
        amountOutRaw: item.amountOut, stepAmountsInRaw: [item.amountIn],
        stepAmountsOutRaw: [item.amountOut], amountInMaximumRaw: item.amountIn,
        outputGranularity: item.outputGranularity,
      }),
    }
    const encoded = await encodeScenario(scenario, {})
    assert.match(encoded.planner.commands, /^0x25/)
  }
})

test('encodes the registered Nile PSM Exact-Out pair without a mainnet address dependency', async () => {
  const scenario = {
    recipient: () => '0x4000000000000000000000000000000000000000',
    buildQuote: () => buildExactOutQuote({
      tokens: [nile.tokens.usdtnew, nile.tokens.usdd], poolVersions: ['usdt20psm'], poolFees: ['0'],
      amountOutRaw: 1_000_000_000_000n, stepAmountsInRaw: [1n],
      stepAmountsOutRaw: [1_000_000_000_000n], amountInMaximumRaw: 1n,
      outputGranularity: 1_000_000_000_000n,
    }),
  }
  const encoded = await encodeScenario(scenario, {})
  assert.match(encoded.planner.commands, /^0x25/)
})
