const test = require('node:test')
const assert = require('node:assert/strict')
const { exactOutInput } = require('../src/nile-v2.cjs')

test('V2 exact-output math matches the Router unconditional floor plus one', () => {
  assert.equal(exactOutInput(10_000n, 1_000_000n, 1_000_000n), 10_132n)
  assert.throws(() => exactOutInput(1_000_000n, 1n, 1_000_000n), /liquidity/)
})
