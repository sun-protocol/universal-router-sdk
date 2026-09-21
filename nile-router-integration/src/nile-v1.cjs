const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

const factoryAbi = [{ name: 'getExchange', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'address' }] }]
const exchangeAbi = [
  { name: 'getTrxToTokenInputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trxSold', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'getTokenToTrxInputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokensSold', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'getTrxToTokenOutputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokensBought', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'getTokenToTrxOutputPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trxBought', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
]

function normalizeAddress(tronWeb, value) {
  if (typeof value !== 'string') value = value.toString()
  return value.startsWith('T') ? value : tronWeb.address.fromHex(value.startsWith('41') ? value : `41${value.replace(/^0x/, '')}`)
}

function client() {
  const tronWeb = new TronWeb({ fullHost: process.env.NILE_FULL_NODE || nile.fullNode })
  // TRON constant calls still require an owner_address even though they do not sign.
  tronWeb.setAddress(nile.universalRouter)
  return tronWeb
}

async function exchangeFor(tronWeb, token) {
  const factory = await tronWeb.contract(factoryAbi, nile.v1Factory)
  const exchangeAddress = normalizeAddress(tronWeb, await factory.getExchange(token).call())
  return { exchangeAddress, exchange: await tronWeb.contract(exchangeAbi, exchangeAddress) }
}

async function quoteNativeToToken(amountOut, tokenOut) {
  const tronWeb = client()
  const { exchangeAddress, exchange } = await exchangeFor(tronWeb, tokenOut)
  const amountIn = BigInt((await exchange.getTrxToTokenOutputPrice(amountOut.toString()).call()).toString())
  return { amountIn, exchange: exchangeAddress }
}

async function quoteTokenToNative(tokenIn, amountOut) {
  const tronWeb = client()
  const { exchangeAddress, exchange } = await exchangeFor(tronWeb, tokenIn)
  const amountIn = BigInt((await exchange.getTokenToTrxOutputPrice(amountOut.toString()).call()).toString())
  return { amountIn, exchange: exchangeAddress }
}

async function quoteTokenToToken(tokenIn, tokenOut, amountOut) {
  const tronWeb = client()
  const input = await exchangeFor(tronWeb, tokenIn)
  const output = await exchangeFor(tronWeb, tokenOut)
  const trxRequired = BigInt((await output.exchange.getTrxToTokenOutputPrice(amountOut.toString()).call()).toString())
  const amountIn = BigInt((await input.exchange.getTokenToTrxOutputPrice(trxRequired.toString()).call()).toString())
  return { amountIn, trxRequired, inputExchange: input.exchangeAddress, outputExchange: output.exchangeAddress }
}

async function quoteExactInput(tokenIn, tokenOut, amountIn) {
  const tronWeb = client()
  if (tokenIn === nile.tokens.trx) {
    const output = await exchangeFor(tronWeb, tokenOut)
    const amountOut = BigInt((await output.exchange.getTrxToTokenInputPrice(amountIn.toString()).call()).toString())
    return { amountOut, outputExchange: output.exchangeAddress }
  }
  const input = await exchangeFor(tronWeb, tokenIn)
  const trxOut = BigInt((await input.exchange.getTokenToTrxInputPrice(amountIn.toString()).call()).toString())
  if (tokenOut === nile.tokens.trx) return { amountOut: trxOut, inputExchange: input.exchangeAddress }
  const output = await exchangeFor(tronWeb, tokenOut)
  const amountOut = BigInt((await output.exchange.getTrxToTokenInputPrice(trxOut.toString()).call()).toString())
  return { amountOut, trxOut, inputExchange: input.exchangeAddress, outputExchange: output.exchangeAddress }
}

module.exports = { quoteNativeToToken, quoteTokenToNative, quoteTokenToToken, quoteExactInput }
