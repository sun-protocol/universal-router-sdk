#!/usr/bin/env node
const path = require('node:path')
const { TronWeb } = require('tronweb')
const { loadEnv, required } = require('./env.cjs')
const { loadScenarios } = require('./scenarios.cjs')
const { encodeScenario } = require('./sdk.cjs')
const { simulateOnNile, executeOnNile } = require('./executor.cjs')
const { writeReport } = require('./report.cjs')

if (process.env.NILE_ENV_FILE) loadEnv(process.env.NILE_ENV_FILE)
loadEnv()
if (!process.env.NILE_PRIVATE_KEY && process.env.PRIVATE_KEY) process.env.NILE_PRIVATE_KEY = process.env.PRIVATE_KEY
const privateKey = required('NILE_PRIVATE_KEY')
if (process.env.NILE_SEND !== 'true') throw new Error('Refusing regression broadcast: set NILE_SEND=true')
if (!process.env.NILE_RECIPIENT) {
  const tronWeb = new TronWeb({ fullHost: process.env.NILE_FULL_NODE || 'https://nile.trongrid.io', privateKey })
  process.env.NILE_RECIPIENT = tronWeb.defaultAddress.base58
}

const expectedFailures = [
  'v1-exact-in-min-too-high',
  'v1-usdt-usddold-budget-too-low',
  'psm-usdtnew-usdd-round-up-budget-too-low',
  'v2-trx-usdt-budget-too-low',
]

const liveCases = [
  'psm-exact-in-usdtnew-usdd', 'psm-exact-in-usdd-usdtnew',
  'psm-usdtnew-usdd', 'psm-usdd-usdtnew',
  'psm-usdtnew-usdd-round-up', 'psm-usdd-usdtnew-rounded-cleanup',
  'v1-exact-in-trx-usdt', 'v1-exact-in-usdt-trx', 'v1-exact-in-usdt-usddold',
  'v1-trx-usdt', 'v1-usdt-trx', 'v1-usdt-usddold',
  'v2-trx-usdt', 'v2-usdt-usddold', 'v2-trx-usddold-usdt',
  'v3-exact-in-trx-usdt', 'v3-trx-usdt', 'v3-usdt-usddold', 'v3-trx-usddold-usdt',
  'v4-trx-usdt', 'v4-usdt-trx', 'v4-trx-usddold-usdt',
  'wrap-trx-wtrx', 'unwrap-wtrx-trx',
  'v1-trx-usdt-output-fee', 'v2-trx-usdt-output-fee',
  'v3-trx-usdt-output-fee', 'v4-trx-usdt-output-fee',
]

async function main() {
  const scenarios = loadScenarios(path.join(__dirname, '..', 'scenarios'))
  const requestedCases = process.argv.slice(2)
  const summary = { router: require('../config/nile.json').universalRouter,
    startedAt: new Date().toISOString(), expectedFailures: [], executions: [] }

  const requested = new Set(requestedCases)
  const failuresToRun = requested.size ? expectedFailures.filter(id => requested.has(id)) : expectedFailures
  const liveToRun = requested.size ? liveCases.filter(id => requested.has(id)) : liveCases
  if (requested.size && failuresToRun.length + liveToRun.length !== requested.size) {
    const known = new Set([...failuresToRun, ...liveToRun])
    throw new Error(`Unknown MR8 regression case: ${requestedCases.filter(id => !known.has(id)).join(', ')}`)
  }

  for (const id of failuresToRun) {
    console.log(`START ${id}`)
    const scenario = scenarios.get(id)
    const encoded = { scenario, ...await encodeScenario(scenario, process.env) }
    const simulation = await simulateOnNile(encoded)
    if (!simulation.expected) throw new Error(`${id} did not produce its expected revert`)
    const result = { id, simulation }
    summary.expectedFailures.push(result)
    writeReport(`${id}-mr8`, {
      router: summary.router,
      completedAt: new Date().toISOString(),
      expectedFailure: result,
    })
    console.log(`EXPECTED_REVERT ${id}`)
  }

  for (const id of liveToRun) {
    console.log(`START ${id}`)
    const scenario = scenarios.get(id)
    const preQuotePreparation = scenario.prepareBeforeQuote
      ? await scenario.prepareBeforeQuote({ env: process.env }) : undefined
    if (preQuotePreparation) console.log(`PREPARED_QUOTE ${id}`)
    const encoded = { scenario, ...await encodeScenario(scenario, process.env) }
    console.log(`ENCODED ${id}`)
    const preparation = scenario.prepare ? await scenario.prepare({ encoded, env: process.env }) : undefined
    console.log(`PREPARED ${id}`)
    const simulation = await simulateOnNile(encoded)
    if (!simulation.success) throw new Error(`${id} simulation failed`)
    console.log(`SIMULATED ${id}`)
    const execution = await executeOnNile(encoded)
    if (execution.assertionFailure) throw new Error(`${id}: ${execution.assertionFailure}`)
    const result = { id, preQuotePreparation, preparation, simulation, execution }
    summary.executions.push(result)
    writeReport(`${id}-mr8`, {
      router: summary.router,
      completedAt: new Date().toISOString(),
      execution: result,
    })
    console.log(`SUCCESS ${id} ${execution.txid}`)
  }

  summary.completedAt = new Date().toISOString()
  const report = writeReport('mr8-regression', summary)
  console.log(`REPORT ${report}`)
}

const keepAlive = setInterval(() => console.log('WAIT rpc'), 10_000)
main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => clearInterval(keepAlive))
