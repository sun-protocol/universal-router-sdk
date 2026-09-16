const fs = require('node:fs')
const path = require('node:path')

function loadScenarios(directory = path.join(__dirname, '..', 'scenarios')) {
  const entries = fs.readdirSync(directory).filter(name => name.endsWith('.cjs')).sort()
  const scenarios = new Map()
  for (const entry of entries) {
    const scenario = require(path.join(directory, entry))
    if (!scenario.id || typeof scenario.buildQuote !== 'function') throw new Error(`Invalid scenario: ${entry}`)
    if (scenarios.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`)
    scenarios.set(scenario.id, scenario)
  }
  return scenarios
}

module.exports = { loadScenarios }
