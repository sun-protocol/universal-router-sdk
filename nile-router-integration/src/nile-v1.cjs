const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

const factoryAbi = [{ name: 'getExchange', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'address' }] }]
const exchangeAbi = [
  { name: 'getTrxToTokenOutputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokensBought', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'getTokenToTrxOutputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trxBought', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
]

function normalizeAddress(tronWeb, value) {
  if (typeof value !== 'string') value = value.toString()
  return value.startsWith('T') ? value : tronWeb.address.fromHex(value.startsWith('41') ? value : `41${value.replace(/^0x/, '')}`)
}

async function quoteNativeToToken(amountOut, tokenOut) {
  const endpoint = process.env.NILE_FULL_NODE || nile.fullNode
  const tronWeb = new TronWeb({ fullHost: endpoint })
  // TRON constant calls still require an owner_address even though they do not sign.
  tronWeb.setAddress(nile.universalRouter)
  const factory = await tronWeb.contract(factoryAbi, nile.v1Factory)
  const exchangeAddress = normalizeAddress(tronWeb, await factory.getExchange(tokenOut).call())
  const exchange = await tronWeb.contract(exchangeAbi, exchangeAddress)
  const amountIn = BigInt((await exchange.getTrxToTokenOutputPrice(amountOut.toString()).call()).toString())
  return { amountIn, exchange: exchangeAddress }
}

async function quoteTokenToNative(tokenIn, amountOut) {
  const endpoint = process.env.NILE_FULL_NODE || nile.fullNode
  const tronWeb = new TronWeb({ fullHost: endpoint })
  tronWeb.setAddress(nile.universalRouter)
  const factory = await tronWeb.contract(factoryAbi, nile.v1Factory)
  const exchangeAddress = normalizeAddress(tronWeb, await factory.getExchange(tokenIn).call())
  const exchange = await tronWeb.contract(exchangeAbi, exchangeAddress)
  const amountIn = BigInt((await exchange.getTokenToTrxOutputPrice(amountOut.toString()).call()).toString())
  return { amountIn, exchange: exchangeAddress }
}

module.exports = { quoteNativeToToken, quoteTokenToNative }
