#!/usr/bin/env node
const { TronWeb } = require('tronweb')
const { loadEnv, required } = require('./env.cjs')
const nile = require('../config/nile.json')

if (process.env.NILE_ENV_FILE) loadEnv(process.env.NILE_ENV_FILE)
loadEnv()
if (!process.env.NILE_PRIVATE_KEY && process.env.PRIVATE_KEY) {
  process.env.NILE_PRIVATE_KEY = process.env.PRIVATE_KEY
}

const tokenAbi = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
]
const routerAbi = [{ name: 'referralVault', type: 'function', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address' }] }]

async function main() {
  const endpoint = process.env.NILE_FULL_NODE || nile.fullNode
  const privateKey = required('NILE_PRIVATE_KEY')
  const tronWeb = new TronWeb(endpoint, endpoint, endpoint, privateKey)
  const account = tronWeb.defaultAddress.base58
  if (!account) throw new Error('Could not derive test account from NILE_PRIVATE_KEY')
  const router = process.env.NILE_ROUTER_ADDRESS || nile.universalRouter
  const routerContract = await tronWeb.trx.getContract(router)
  if (!routerContract?.bytecode) throw new Error(`Universal Router is not deployed: ${router}`)
  const trx = BigInt(await tronWeb.trx.getBalance(account))
  const routerReader = await tronWeb.contract(routerAbi, router)
  const referralVault = (await routerReader.referralVault().call()).toString()
  const balances = []
  for (const [symbol, address] of Object.entries(nile.tokens)) {
    if (symbol === 'trx') continue
    try {
      const token = await tronWeb.contract(tokenAbi, address)
      const [raw, decimals] = await Promise.all([token.balanceOf(account).call(), token.decimals().call()])
      balances.push({ symbol, address, decimals: Number(decimals), raw: BigInt(raw.toString()).toString() })
    } catch (error) {
      balances.push({ symbol, address, error: error instanceof Error ? error.message : String(error) })
    }
  }
  console.log(JSON.stringify({ network: 'nile', endpoint, router, routerContract: routerContract.name,
    referralVault,
    account, trxSun: trx.toString(), tokens: balances }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
