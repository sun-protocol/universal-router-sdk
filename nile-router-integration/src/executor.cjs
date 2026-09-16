const { TronWeb } = require('tronweb')
const { required } = require('./env.cjs')
const nile = require('../config/nile.json')

function client() {
  const privateKey = required('NILE_PRIVATE_KEY')
  const endpoint = process.env.NILE_FULL_NODE || nile.fullNode
  return new TronWeb(endpoint, endpoint, endpoint, privateKey)
}

function executeParameters(encoded) {
  const deadline = Math.floor(Date.now() / 1000) + Number(encoded.scenario.deadlineSeconds ?? 600)
  return [
    { type: 'bytes', value: encoded.planner.commands },
    { type: 'bytes[]', value: encoded.planner.inputs },
    { type: 'uint256', value: deadline },
  ]
}

async function simulateOnNile(encoded) {
  const tronWeb = client()
  const router = process.env.NILE_ROUTER_ADDRESS || nile.universalRouter
  let result
  try {
    result = await tronWeb.transactionBuilder.triggerConstantContract(
      router, 'execute(bytes,bytes[],uint256)', {
        callValue: Number(encoded.planner.callValue),
        feeLimit: Number(encoded.scenario.feeLimit ?? 500_000_000),
      }, executeParameters(encoded), tronWeb.defaultAddress.base58)
  } catch (error) {
    const rpcError = error instanceof Error ? error.message : String(error)
    if (encoded.scenario.expectedSimulationFailure && /revert|REVERT opcode/i.test(rpcError)) {
      return { success: false, expected: true, reason: encoded.scenario.expectedSimulationFailure,
        rpcError }
    }
    throw error
  }
  if (!result.result?.result) {
    const message = result.result?.message
      ? Buffer.from(result.result.message, 'base64').toString('utf8') : 'unknown error'
    if (encoded.scenario.expectedSimulationFailure) {
      return { success: false, expected: true, reason: encoded.scenario.expectedSimulationFailure,
        rpcError: message }
    }
    throw new Error(`Nile simulation failed: ${message}`)
  }
  return { success: true, energyUsed: result.energy_used, constantResult: result.constant_result }
}

async function executeOnNile(encoded) {
  if (process.env.NILE_SEND !== 'true') {
    throw new Error('Refusing to broadcast: set NILE_SEND=true for an intentional Nile execution')
  }
  const router = process.env.NILE_ROUTER_ADDRESS || nile.universalRouter
  const tronWeb = client()
  if (encoded.planner.callValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('callValue exceeds TronWeb safe integer range')
  }
  if (encoded.scenario.beforeExecute) await encoded.scenario.beforeExecute({ tronWeb, encoded })
  const built = await tronWeb.transactionBuilder.triggerSmartContract(router, 'execute(bytes,bytes[],uint256)', {
    callValue: Number(encoded.planner.callValue),
    feeLimit: Number(encoded.scenario.feeLimit ?? 500_000_000),
  }, executeParameters(encoded))
  if (!built.result?.result) throw new Error(`Router trigger failed: ${built.result?.message ?? 'unknown error'}`)
  const signed = await tronWeb.trx.sign(built.transaction)
  const broadcast = await tronWeb.trx.sendRawTransaction(signed)
  if (!broadcast.result) throw new Error(`Broadcast failed: ${broadcast.message ?? 'unknown error'}`)
  const receipt = await waitForReceipt(tronWeb, broadcast.txid)
  let assertionFailure
  try {
    if (encoded.scenario.afterExecute) await encoded.scenario.afterExecute({ tronWeb, encoded, receipt })
  } catch (error) {
    assertionFailure = error instanceof Error ? error.message : String(error)
  }
  return { txid: broadcast.txid, receipt, assertions: encoded.assertions, assertionFailure }
}

async function waitForReceipt(tronWeb, txid, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const info = await tronWeb.trx.getTransactionInfo(txid)
    if (info?.id) {
      if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
        throw new Error(`Nile execution failed: ${info.receipt.result} (${txid})`)
      }
      return info
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error(`Timed out waiting for Nile transaction: ${txid}`)
}

module.exports = { executeOnNile, simulateOnNile, waitForReceipt }
