const test = require('node:test')
const assert = require('node:assert/strict')
const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

test('all configured Nile contract addresses have valid Base58 checksums', () => {
  const tronWeb = new TronWeb({ fullHost: nile.fullNode })
  function validate(value, name) {
    if (value && typeof value === 'object') {
      for (const [childName, child] of Object.entries(value)) validate(child, `${name}.${childName}`)
    } else if (typeof value === 'string' && value.startsWith('T')) {
      assert.equal(tronWeb.isAddress(value), true, `${name}: ${value}`)
    }
  }
  validate(nile, 'nile')
})

test('deployment metadata matches the current Exact-Out Router deployment', () => {
  assert.equal(nile.universalRouter, 'TPpiiS3FiDxBMRzyhfaQDokxqybchY3vNz')
  assert.equal(nile.routerSourceCommit, null)
  assert.equal(nile.deploymentTxId, null)
  assert.equal(nile.deploymentBlock, null)
})
