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

test('deployment metadata matches the V1 Exact-Out Router source baseline', () => {
  assert.equal(nile.universalRouter, 'TM8zZWPHSwApPYiMvaRPkR1QSMFnqu2pQ2')
  assert.equal(nile.routerSourceCommit, '4fbc87557dcddbe3031409ab65561035eb292ac6')
  assert.match(nile.deploymentTxId, /^[0-9a-f]{64}$/)
})
