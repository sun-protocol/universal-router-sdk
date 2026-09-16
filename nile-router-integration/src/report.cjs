const fs = require('node:fs')
const path = require('node:path')

function json(value) {
  return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2)
}

function writeReport(scenarioId, value) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(__dirname, '..', 'reports', `${timestamp}-${scenarioId}.json`)
  fs.writeFileSync(target, json(value) + '\n')
  return target
}

module.exports = { json, writeReport }
