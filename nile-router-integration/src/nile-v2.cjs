const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

const factoryAbi = [{ name: 'getPair', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }, { name: 'b', type: 'address' }], outputs: [{ type: 'address' }] }]
const pairAbi = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [
    { type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' },
  ] },
]

function nativeClient() {
  const tronWeb = new TronWeb({ fullHost: process.env.NILE_FULL_NODE || nile.fullNode })
  tronWeb.setAddress(nile.universalRouter)
  return tronWeb
}

function hex(tronWeb, address) {
  return `0x${tronWeb.address.toHex(address).slice(2).toLowerCase()}`
}

function exactOutInput(output, reserveIn, reserveOut) {
  if (output <= 0n || reserveIn <= 0n || output >= reserveOut) throw new Error('Insufficient V2 liquidity')
  return reserveIn * output * 1000n / ((reserveOut - output) * 997n) + 1n
}

async function quoteV2ExactOut(tokenIn, tokenOut, amountOut) {
  const tronWeb = nativeClient()
  const factory = await tronWeb.contract(factoryAbi, nile.v2Factory)
  const pairAddress = await factory.getPair(tokenIn, tokenOut).call()
  const pair = await tronWeb.contract(pairAbi, pairAddress)
  const [token0Raw, reserves] = await Promise.all([pair.token0().call(), pair.getReserves().call()])
  const token0 = hex(tronWeb, token0Raw.toString())
  const inputIs0 = hex(tronWeb, tokenIn) === token0
  const reserve0 = BigInt(reserves[0].toString()), reserve1 = BigInt(reserves[1].toString())
  const reserveIn = inputIs0 ? reserve0 : reserve1
  const reserveOut = inputIs0 ? reserve1 : reserve0
  return { amountIn: exactOutInput(amountOut, reserveIn, reserveOut), pair: pairAddress.toString(), reserveIn, reserveOut }
}

module.exports = { exactOutInput, quoteV2ExactOut }
