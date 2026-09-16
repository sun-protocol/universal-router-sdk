const tokenAbi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }]

async function trxBalance(tronWeb, owner) {
  return BigInt(await tronWeb.trx.getBalance(owner))
}

async function tokenBalance(tronWeb, tokenAddress, owner) {
  const token = await tronWeb.contract(tokenAbi, tokenAddress)
  return BigInt((await token.balanceOf(owner).call()).toString())
}

module.exports = { trxBalance, tokenBalance }
