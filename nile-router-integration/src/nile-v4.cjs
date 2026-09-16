const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

const quoteAbi = [{
  // The Solidity function is nonpayable because it quotes through controlled
  // reverts. Marking it view locally only tells TronWeb to use a constant call.
  name: 'quoteExactOutputSingle', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'poolKey', type: 'tuple', components: [
      { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
      { name: 'hooks', type: 'address' }, { name: 'fee', type: 'uint24' },
      { name: 'parameters', type: 'bytes32' },
    ] },
    { name: 'zeroForOne', type: 'bool' }, { name: 'exactAmount', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ] }],
  outputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
}, {
  name: 'quoteExactOutput', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'exactCurrency', type: 'address' },
    { name: 'path', type: 'tuple[]', components: [
      { name: 'intermediateCurrency', type: 'address' }, { name: 'fee', type: 'uint24' },
      { name: 'hooks', type: 'address' }, { name: 'hookData', type: 'bytes' },
      { name: 'parameters', type: 'bytes32' },
    ] },
    { name: 'exactAmount', type: 'uint128' },
  ] }],
  outputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
}]

function client() {
  const tronWeb = new TronWeb({ fullHost: process.env.NILE_FULL_NODE || nile.fullNode })
  tronWeb.setAddress(nile.universalRouter)
  return tronWeb
}

async function quoteV4ExactOut(poolKey, zeroForOne, amountOut) {
  const quoter = await client().contract(quoteAbi, nile.v4Quoter)
  // TronWeb's ethers v6 encoder drops nested tuple component names, so tuple
  // values must be positional here even though the Solidity ABI names them.
  const key = [poolKey.currency0, poolKey.currency1, poolKey.hooks, poolKey.fee, poolKey.parameters]
  const result = await quoter.quoteExactOutputSingle([
    key, zeroForOne, amountOut.toString(), '0x',
  ]).call()
  return {
    amountIn: BigInt((result.amountIn ?? result[0]).toString()),
    gasEstimate: BigInt((result.gasEstimate ?? result[1]).toString()),
  }
}

async function quoteV4ExactOutPath(currencyOut, path, amountOut) {
  const quoter = await client().contract(quoteAbi, nile.v4Quoter)
  const encodedPath = path.map(key => [key.intermediateCurrency, key.fee, key.hooks,
    key.hookData ?? '0x', key.parameters])
  const result = await quoter.quoteExactOutput([
    currencyOut, encodedPath, amountOut.toString(),
  ]).call()
  return {
    amountIn: BigInt((result.amountIn ?? result[0]).toString()),
    gasEstimate: BigInt((result.gasEstimate ?? result[1]).toString()),
  }
}

module.exports = { quoteV4ExactOut, quoteV4ExactOutPath }
