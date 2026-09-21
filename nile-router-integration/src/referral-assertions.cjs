const assert = require('node:assert/strict')
const { tokenBalance } = require('./balances.cjs')

const routerAbi = [{
  name: 'referralVault', type: 'function', stateMutability: 'view', inputs: [],
  outputs: [{ type: 'address' }],
}]

const vaultAbi = [
  { name: 'referralBalance', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'totalReferralBalance', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getProtocolFunds', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'lastTokenBalance', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'defaultBips', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'customRebateBips', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'hasCustomRebateBips', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
]

function addressFromCall(tronWeb, value) {
  const address = value.toString()
  return address.startsWith('41') ? tronWeb.address.fromHex(address) : address
}

async function referralState(tronWeb, routerAddress, token, rebateRecipient) {
  const router = await tronWeb.contract(routerAbi, routerAddress)
  const vaultAddress = addressFromCall(tronWeb, await router.referralVault().call())
  const vault = await tronWeb.contract(vaultAbi, vaultAddress)
  const hasCustomBips = Boolean(await vault.hasCustomRebateBips(rebateRecipient).call())
  const rebateBips = BigInt((hasCustomBips
    ? await vault.customRebateBips(rebateRecipient).call()
    : await vault.defaultBips().call()).toString())

  return {
    vaultAddress,
    rebateBips,
    vaultTokenBalance: await tokenBalance(tronWeb, token, vaultAddress),
    referralBalance: BigInt((await vault.referralBalance(token, rebateRecipient).call()).toString()),
    totalReferralBalance: BigInt((await vault.totalReferralBalance(token).call()).toString()),
    protocolFunds: BigInt((await vault.getProtocolFunds(token).call()).toString()),
    lastTokenBalance: BigInt((await vault.lastTokenBalance(token).call()).toString()),
  }
}

function withOutputReferralAssertions(scenario, outputToken) {
  const beforeExecute = scenario.beforeExecute
  const afterExecute = scenario.afterExecute

  return {
    ...scenario,
    async beforeExecute(context) {
      if (beforeExecute) await beforeExecute.call(this, context)
      if (!context.encoded.quote.amountOutReferralBips) return
      this.outputReferralSnapshot = await referralState(
        context.tronWeb, context.router, outputToken, context.encoded.referralRecipient)
    },
    async afterExecute(context) {
      if (afterExecute) await afterExecute.call(this, context)
      if (!context.encoded.quote.amountOutReferralBips) return
      const before = this.outputReferralSnapshot
      const after = await referralState(
        context.tronWeb, context.router, outputToken, context.encoded.referralRecipient)
      const commission = after.vaultTokenBalance - before.vaultTokenBalance
      const referralCredit = after.referralBalance - before.referralBalance
      const totalReferralCredit = after.totalReferralBalance - before.totalReferralBalance
      const protocolCredit = after.protocolFunds - before.protocolFunds
      const expectedCommission = BigInt(context.encoded.quote.amountOutRawReferral)
      const expectedReferralCredit = commission * before.rebateBips / 10_000n

      assert.equal(after.vaultAddress, before.vaultAddress, 'Router ReferralVault changed during execution')
      assert.equal(after.rebateBips, before.rebateBips, 'rebate bips changed during execution')
      assert.equal(commission, expectedCommission, 'ReferralVault commission inflow')
      assert.equal(referralCredit, expectedReferralCredit, 'rebate recipient credit')
      assert.equal(totalReferralCredit, expectedReferralCredit, 'total referral credit')
      assert.equal(protocolCredit, commission - expectedReferralCredit, 'protocol credit')
      assert.equal(after.lastTokenBalance, after.vaultTokenBalance, 'ReferralVault token snapshot')

      Object.assign(context.encoded.assertions, {
        referralVault: after.vaultAddress,
        outputCommission: commission,
        rebateBips: before.rebateBips,
        referralCredit,
        protocolCredit,
        referralVaultBalanceAccounted: true,
      })
    },
  }
}

module.exports = { referralState, withOutputReferralAssertions }
