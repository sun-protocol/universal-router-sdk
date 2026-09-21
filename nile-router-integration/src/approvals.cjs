const { TronWeb } = require('tronweb')
const { waitForReceipt } = require('./executor.cjs')
const { withTimeout } = require('./balances.cjs')
const nile = require('../config/nile.json')

const tokenAbi = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
  ], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [
    { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' },
  ], outputs: [{ type: 'bool' }] },
]
const permit2Abi = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [
    { name: 'user', type: 'address' }, { name: 'token', type: 'address' },
    { name: 'spender', type: 'address' },
  ], outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [
    { name: 'token', type: 'address' }, { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' },
  ], outputs: [] },
]

function client(env) {
  const endpoint = env.NILE_FULL_NODE || nile.fullNode
  return new TronWeb(endpoint, endpoint, endpoint, env.NILE_PRIVATE_KEY)
}

async function sendAndWait(tronWeb, method, feeLimit = 100_000_000) {
  const txid = await withTimeout(method.send({ feeLimit }), 'Approval broadcast', 30_000)
  const receipt = await waitForReceipt(tronWeb, txid)
  return { txid, receipt }
}

async function preparePermit2(env, tokenAddress, requiredAmount) {
  if (env.NILE_SEND !== 'true') {
    throw new Error('Refusing to broadcast approvals: set NILE_SEND=true for an intentional Nile preparation')
  }
  const tronWeb = client(env)
  const owner = tronWeb.defaultAddress.base58
  const router = env.NILE_ROUTER_ADDRESS || nile.universalRouter
  const token = await tronWeb.contract(tokenAbi, tokenAddress)
  const permit2 = await tronWeb.contract(permit2Abi, nile.permit2)
  const required = BigInt(requiredAmount)
  const approvals = []

  const tokenAllowance = BigInt((await withTimeout(
    token.allowance(owner, nile.permit2).call(), `ERC20 allowance ${tokenAddress}`)).toString())
  if (tokenAllowance < required) {
    approvals.push({ layer: 'ERC20→Permit2', ...await sendAndWait(
      tronWeb, token.approve(nile.permit2, required.toString())) })
  }

  const packed = await withTimeout(
    permit2.allowance(owner, tokenAddress, router).call(), `Permit2 allowance ${tokenAddress}`)
  const amount = BigInt((packed.amount ?? packed[0]).toString())
  const expiration = BigInt((packed.expiration ?? packed[1]).toString())
  const minimumExpiry = BigInt(Math.floor(Date.now() / 1000) + 600)
  if (amount < required || expiration < minimumExpiry) {
    const newExpiration = Math.floor(Date.now() / 1000) + 86_400
    approvals.push({ layer: 'Permit2→UniversalRouter', ...await sendAndWait(
      tronWeb, permit2.approve(tokenAddress, router, required.toString(), newExpiration)) })
  }
  return { owner, token: tokenAddress, permit2: nile.permit2, router,
    requiredAmount: required, approvals }
}

module.exports = { preparePermit2 }
