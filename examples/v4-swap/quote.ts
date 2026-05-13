// TronWeb PoolManager Initialize Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps

import { parseConstantResult, toEvmHex, tronWebNile, tronWebMainnet, NILE, MAINNET } from './helper'

interface PoolKey {
  currency0: string
  currency1: string
  hooks: string
  fee: number
  parameters: string
}
interface QuoteExactSingleParams {
  poolKey: PoolKey
  zeroForOne: boolean
  exactAmount: bigint
  hookData: string
  network: string
}

async function quoteExactInputSingle(params: QuoteExactSingleParams): Promise<void> {
  const tronWeb = params.network === 'nile' ? tronWebNile : tronWebMainnet
  const constants = params.network === 'nile' ? NILE : MAINNET
  let token0 = toEvmHex(params.poolKey.currency0)
  let token1 = toEvmHex(params.poolKey.currency1)
  let hooks = toEvmHex(params.poolKey.hooks)
  if (token0.toLowerCase() >= token1.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
  }

  console.log('============================================================')
  console.log(' Universal Router V4 Quote')
  console.log('============================================================')
  console.log('')
  console.log('Input:')
  console.log(`  Network    : ${params.network}`)
  console.log(`  zeroForOne : ${params.zeroForOne}`)
  console.log(`  exactAmount: ${params.exactAmount.toString()}`)
  console.log('  PoolKey:')
  console.log(`    currency0 : ${params.poolKey.currency0}`)
  console.log(`    currency1 : ${params.poolKey.currency1}`)
  console.log(`    hooks     : ${params.poolKey.hooks}`)
  console.log(`    fee       : ${params.poolKey.fee}`)
  console.log(`    parameters: ${params.poolKey.parameters}`)
  console.log('')

  try {
    // Method 1: Use triggerSmartContract
    try {
      const functionSelector = 'quoteExactInputSingle(((address,address,address,uint24,bytes32),bool,uint128,bytes))'

      // TronWeb parameter format
      const parameter = [
        {
          type: '((address,address,address,uint24,bytes32),bool,uint128,bytes)',
          value: [
            [token0, token1, hooks, params.poolKey.fee, params.poolKey.parameters],
            params.zeroForOne,
            params.exactAmount,
            '0x',
          ],
        },
      ]

      const resultQuote = await tronWeb.transactionBuilder.triggerConstantContract(
        constants.clQuoter,
        functionSelector,
        {},
        parameter
      )

      if (resultQuote.result && resultQuote.constant_result && resultQuote.constant_result.length > 0) {
        const parsed = parseConstantResult(resultQuote.constant_result[0], [
          { name: 'amountOut', type: 'uint256' },
          { name: 'gasEstimate', type: 'uint256' },
        ])

        console.log('--------------------------- RESULT -------------------------')
        console.log('Raw constant call output:')
        console.log(
          JSON.stringify(resultQuote, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
        )
        console.log('')
        console.log('Parsed quote:')
        console.log(`  Amount Out : ${parsed.amountOut.toString()}`)
        console.log(`  Gas Estimate: ${parsed.gasEstimate.toString()}`)
        console.log('------------------------------------------------------------')
      } else {
        console.log('⚠️  No quote result returned from constant call.')
      }

      return
    } catch (triggerError: any) {
      console.error('')
      console.error('❌ Trigger smart contract failed.')
      console.error('Reason:', triggerError?.message ?? triggerError)
    }

    console.log('')
    console.log('Quote attempt finished.')
  } catch (error: any) {
    console.error('❌ Quote failed:', error)

    // Common error messages and solutions
    if (error.message) {
      console.error('💬 Error Message:', error.message)

      if (error.message.includes('CurrenciesInitializedOutOfOrder')) {
        console.log('💡 Hint: Ensure currency0 < currency1 (addresses must be sorted)')
      } else if (error.message.includes('TickSpacingToo')) {
        console.log('💡 Hint: Use valid tick spacing (1-32767)')
      } else if (error.message.includes('LPFeeTooLarge')) {
        console.log('💡 Hint: Fee must be ≤ 1,000,000 (100%)')
      }
    }
  }
}

// Run the test
if (require.main === module) {
  ;(async () => {
    try {
      const TRX_ADDRESS: string = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
      const USDT_ADDRESS: string = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
      await quoteExactInputSingle({
        poolKey: {
          currency0: TRX_ADDRESS,
          currency1: USDT_ADDRESS,
          hooks: '0x0000000000000000000000000000000000000000',
          fee: 3000,
          parameters: '0x00000000000000000000000000000000000000000000000000000000000a0000',
        },
        zeroForOne: true,
        exactAmount: 100000n,
        hookData: '0x',
        network: 'nile',
      })
      process.exit(0)
    } catch {
      process.exit(1)
    }
  })()
}
