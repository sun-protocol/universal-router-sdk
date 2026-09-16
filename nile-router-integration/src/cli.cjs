#!/usr/bin/env node
const { loadEnv } = require('./env.cjs')
const { loadScenarios } = require('./scenarios.cjs')
const { encodeScenario } = require('./sdk.cjs')
const { executeOnNile, simulateOnNile } = require('./executor.cjs')
const { json, writeReport } = require('./report.cjs')

if (process.env.NILE_ENV_FILE) loadEnv(process.env.NILE_ENV_FILE)
loadEnv()
if (!process.env.NILE_PRIVATE_KEY && process.env.PRIVATE_KEY) {
  process.env.NILE_PRIVATE_KEY = process.env.PRIVATE_KEY
}
const [command = 'list', scenarioId] = process.argv.slice(2)
const scenarios = loadScenarios()

async function main() {
  if (command === 'list') {
    for (const scenario of scenarios.values()) console.log(`${scenario.id}\t${scenario.description}`)
    return
  }
  if (!scenarioId) throw new Error(`Usage: npm run ${command === 'prepare' ? 'approve' : command} -- <scenario-id>`)
  const scenario = scenarios.get(scenarioId)
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`)
  if (command === 'prepare' && scenario.prepareBeforeQuote) {
    const preparation = await scenario.prepareBeforeQuote({ env: process.env })
    const report = { scenario: scenario.id, description: scenario.description, preparation }
    const target = writeReport(`${scenario.id}-prepare`, report)
    console.log(json({ preparation, report: target }))
    return
  }
  const encoded = { scenario, ...await encodeScenario(scenario, process.env) }
  const baseReport = {
    scenario: scenario.id,
    description: scenario.description,
    quoteSource: scenario.lastQuote,
    quote: encoded.quote,
    encoding: {
      commands: encoded.planner.commands,
      inputs: encoded.planner.inputs,
      callValue: encoded.planner.callValue,
      recipient: encoded.recipient,
    },
  }
  if (command === 'encode') {
    console.log(json(baseReport))
    return
  }
  if (command === 'prepare') {
    if (!scenario.prepare) throw new Error(`Scenario ${scenario.id} does not require preparation`)
    const preparation = await scenario.prepare({ encoded, env: process.env })
    const report = { ...baseReport, preparation }
    const target = writeReport(`${scenario.id}-prepare`, report)
    console.log(json({ preparation, report: target }))
    return
  }
  if (command === 'simulate') {
    const simulation = await simulateOnNile(encoded)
    const report = { ...baseReport, simulation }
    const target = writeReport(`${scenario.id}-simulation`, report)
    console.log(json({ ...report, report: target }))
    return
  }
  if (command !== 'execute') throw new Error(`Unknown command: ${command}`)
  const execution = await executeOnNile(encoded)
  const report = { ...baseReport, execution }
  const target = writeReport(scenario.id, report)
  console.log(json({ txid: execution.txid, report: target }))
  if (execution.assertionFailure) throw new Error(`Post-execution assertion failed: ${execution.assertionFailure}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
