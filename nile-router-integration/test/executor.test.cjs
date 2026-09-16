const test = require('node:test')
const assert = require('node:assert/strict')
const { executeOnNile } = require('../src/executor.cjs')

test('never broadcasts without the explicit Nile send switch', async () => {
  const previous = process.env.NILE_SEND
  delete process.env.NILE_SEND
  await assert.rejects(() => executeOnNile({}), /NILE_SEND=true/)
  if (previous !== undefined) process.env.NILE_SEND = previous
})
