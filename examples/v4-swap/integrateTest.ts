import { toEvmHex } from '@sun-protocol/permit2-sdk'
import { PoolVersion } from '@sun-protocol/universal-router-sdk'
import {
  SUN_ADDRESS,
  TRX_ADDRESS,
  USDT_ADDRESS,
  WIN_ADDRESS,
  TUSD_ADDRESS,
  USDJ_ADDRESS,
  USDDOLD_ADDRESS,
  USDC_ADDRESS,
  USDD2_ADDRESS,
  USDD_ADDRESS,
  USDTNEW_ADDRESS,
  THTX_ADDRESS,
  TSUN_ADDRESS,
} from './address'
import { executeSwap, SwapParams as ExecuteSwapParams } from './swap'

interface TestCase {
  group: string
  name: string
  swapParams: SwapParams
  txId?: string
  picked?: boolean
  skipped?: boolean
  error?: Error
}

interface SwapParams {
  fromToken: string
  toToken: string
  amountIn: string
  targetPoolVersion?: PoolVersion
  typeList?: string
  maxCost?: number
}

export async function integrateTest() {
  const amountSampleDecimals3 = (1e3).toString()
  const amountSampleDecimals5 = (1e5).toString()
  const amountSampleDecimals6 = (1e6).toString()
  const amountSampleDecimals18 = (1e18).toString()

  const V1_GROUP = 'v1 swap'
  const V2_GROUP = 'v2 swap'
  const V3_GROUP = 'v3 swap'
  const V4_GROUP = 'v4 swap'
  const STABLE_GROUP = 'stable swap'
  const PSM_GROUP = 'psm swap'
  const HTX_SUN_GROUP = 'htx sun swap'
  const MIXED_GROUP = 'mixed swap'

  const groupWhiteList: Record<string, boolean> = {
    [V1_GROUP]: true,
    [V2_GROUP]: true,
    [V3_GROUP]: true,
    [V4_GROUP]: true,
    [STABLE_GROUP]: true,
    [PSM_GROUP]: true,
    [HTX_SUN_GROUP]: true,
    [MIXED_GROUP]: true,
  }

  const testCases: TestCase[] = [
    {
      group: 'v1 swap',
      name: 'TRX->Sun',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: SUN_ADDRESS,
        amountIn: amountSampleDecimals5,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'Sun->TRX',
      swapParams: {
        fromToken: SUN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v2 swap',
      name: 'TUSD->USDJ',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2',
      },
    },
    {
      group: 'v2 swap',
      name: 'USDJ->TUSD',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2',
      },
    },
    {
      group: 'v2 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2,WTRX',
      },
    },
    {
      group: 'v2 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'TRX->WIN',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals3,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'WIN->TRX',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'WIN->USDT',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'USDT->WIN',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals3,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'TRX->USDC',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDC->TRX',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDC->WIN',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDDOLD 2pool 0x3',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_2POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->USDT 2pool 0x3',
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_2POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->TUSD 2pooltusdusdt 0x4',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_2POOLTUSDUSDT,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDT 2pooltusdusdt 0x4',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_2POOLTUSDUSDT,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ old3pool 0x5',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLD3POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD old3pool 0x5',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLD3POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD oldusdcpool 0x10',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ oldusdcpool 0x10',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->USDJ oldusdcpool 0x10',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDC oldusdcpool 0x10',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->TUSD oldusdcpool 0x10',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDC oldusdcpool 0x10',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->TUSD usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDC usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->USDT usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDC usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDDOLD usdd2pooltusdusdt 0x12',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->USDT usdd2pooltusdusdt 0x12',
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDDOLD usdd2pooltusdusdt 0x12',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->TUSD usdd2pooltusdusdt 0x12',
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDJ usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->TUSD usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },

    {
      group: 'stable swap',
      name: 'TUSD->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },

    {
      group: 'psm swap',
      name: 'USDTNEW->USDD psm usdt20psm 0x1',
      swapParams: {
        fromToken: USDTNEW_ADDRESS,
        toToken: USDD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.PSM_USDT20PSM,
        typeList: 'PSM',
        maxCost: 1,
      },
    },
    {
      group: 'htx sun swap',
      name: 'THTX->TSUN htx_sun htxsun 0x0',
      swapParams: {
        fromToken: THTX_ADDRESS,
        toToken: TSUN_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.HTX_SUN,
        typeList: 'HTX_SUN',
        maxCost: 1,
      },
    },
    {
      group: 'htx sun swap',
      name: 'TSUN->THTX htx_sun htxsun 0x0',
      swapParams: {
        fromToken: TSUN_ADDRESS,
        toToken: THTX_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.HTX_SUN,
        typeList: 'HTX_SUN',
        maxCost: 1,
      },
    },
    {
      group: 'mixed swap',
      name: 'TRX->USDC',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'TRX->WIN',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'WIN->TRX',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
  ]
  // check is there any test case has picked
  const pickedCases: TestCase[] = []
  for (const testCase of testCases) {
    if (testCase.picked) {
      pickedCases.push(testCase)
    }
  }

  if (pickedCases.length === 0) {
    for (const testCase of testCases) {
      if (!groupWhiteList[testCase.group]) {
        console.log(`⏭️  Skipping ${testCase.name} (group: ${testCase.group} not in whitelist)`)
        testCase.skipped = true
        continue
      }
      console.log(`✅ Running ${testCase.name} (group: ${testCase.group})`)

      try {
        const result = await executeSwap({
          tokenIn: testCase.swapParams.fromToken,
          tokenOut: testCase.swapParams.toToken,
          amountIn: testCase.swapParams.amountIn,
          network: 'nile',
          slippageBips: 50,
          amountInReferralBps: 100,
          amountOutReferralBps: 0,
          referralProjectAddress: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
          typeList: testCase.swapParams.typeList,
          maxCost: testCase.swapParams.maxCost,
        } as ExecuteSwapParams)

        testCase.txId = result.txid
      } catch (error) {
        console.error(`❌ Error running ${testCase.name} (group: ${testCase.group})`, error)
        testCase.error = error as Error
      }
    }
  } else {
    console.log(`📋 Running ${pickedCases.length} picked test cases`)
    for (const testCase of pickedCases) {
      if (!groupWhiteList[testCase.group]) {
        console.log(`⏭️  Skipping ${testCase.name} (group: ${testCase.group} not in whitelist)`)
        testCase.skipped = true
        continue
      }
      console.log(`✅ Running ${testCase.name} (group: ${testCase.group})`)

      try {
        const result = await executeSwap({
          tokenIn: testCase.swapParams.fromToken,
          tokenOut: testCase.swapParams.toToken,
          amountIn: testCase.swapParams.amountIn,
          network: 'nile',
          slippageBips: 50,
          amountInReferralBps: 100,
          amountOutReferralBps: 0,
          referralProjectAddress: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
          typeList: testCase.swapParams.typeList,
          maxCost: testCase.swapParams.maxCost,
        } as ExecuteSwapParams)

        testCase.txId = result.txid
      } catch (error) {
        console.error(`❌ Error running ${testCase.name} (group: ${testCase.group})`, error)
        testCase.error = error as Error
      }
    }
  }

  const fs = require('fs')
  const path = require('path')

  const testCasesFilePath = path.join(__dirname, 'testCases.json')

  fs.writeFileSync(testCasesFilePath, JSON.stringify(testCases, null, 2), 'utf-8')
  console.log(`testCases written to ${testCasesFilePath}`)
}

if (require.main === module) {
  integrateTest().catch(e => {
    console.error('Error', e)
  })
}
