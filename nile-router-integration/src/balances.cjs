const tokenAbi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }]

function withTimeout(promise, label, milliseconds = 20_000) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function trxBalance(tronWeb, owner) {
  return BigInt(await withTimeout(tronWeb.trx.getBalance(owner), `TRX balance for ${owner}`))
}

async function tokenBalance(tronWeb, tokenAddress, owner) {
  const token = await tronWeb.contract(tokenAbi, tokenAddress)
  const result = await withTimeout(token.balanceOf(owner).call(), `Token balance ${tokenAddress} for ${owner}`)
  return BigInt(result.toString())
}

module.exports = { trxBalance, tokenBalance, withTimeout }
