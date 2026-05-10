import { getErrorByTransactionHash } from './errorSelector'
import { tronWebMainnet, tronWebNile } from './helper'
import { TronWeb } from 'tronweb'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
}

interface AppliedReferral {
  mode: 'input' | 'output' | 'none'
  bps: number
  projectAddress?: string
}

function formatReferralTag(applied?: AppliedReferral): string {
  if (!applied) {
    return `${colors.gray}[ref: -]${colors.reset}`
  }
  if (applied.mode === 'none') {
    return `${colors.gray}[ref: none]${colors.reset}`
  }
  const color = applied.mode === 'input' ? colors.blue : colors.magenta
  return `${color}[ref: ${applied.mode}/${applied.bps}bps]${colors.reset}`
}

async function txBatchCheck(network: string) {
  if (!network) {
    network = 'nile'
  }
  let tronWeb: TronWeb
  if (network === 'nile') {
    tronWeb = tronWebNile
  } else if (network === 'mainnet') {
    tronWeb = tronWebMainnet
  } else {
    throw new Error(`Invalid network: ${network}`)
  }

  const testCases = require('./testCases.json')

  console.log(`\n${'='.repeat(80)}`)
  console.log(`${colors.blue}Transaction Batch Check${colors.reset}`)
  console.log(`${'='.repeat(80)}\n`)

  for (const testCase of testCases) {
    const referralTag = formatReferralTag(testCase.appliedReferral)

    if (!testCase.error) {
      if (testCase.skipped || !testCase.txId) {
        continue
      }

      const txInfo = await tronWeb.trx.getTransactionInfo(testCase.txId)
      const result = txInfo.receipt?.result || 'NO_RESULT'

      // Color the result
      let coloredResult: string
      if (result === 'SUCCESS') {
        coloredResult = `${colors.green}✓ ${result}${colors.reset}`
      } else if (result === 'NO_RESULT') {
        coloredResult = `${colors.yellow}⚠ ${result}${colors.reset}`
      } else {
        const error = await getErrorByTransactionHash(testCase.txId, network)

        coloredResult = `${colors.red}✗ ${result}: ${error}${colors.reset}`
      }

      console.log(
        `${colors.gray}[${testCase.group}]${colors.reset}`,
        referralTag,
        testCase.name,
        coloredResult,
        `${colors.gray}(${testCase.txId})${colors.reset}`
      )
    } else {
      console.log(
        `${colors.gray}[${testCase.group}]${colors.reset}`,
        referralTag,
        testCase.name,
        `${colors.red}❌ ${testCase.error}${colors.reset}`
      )
    }
  }

  console.log(`\n${'='.repeat(80)}\n`)
}

if (require.main === module) {
  txBatchCheck('nile')
}
