import {
  TradePlanner,
  parseRouteAPIResponse,
  type ParseRouteOptions,
  type ReferralOptions,
} from '@sun-protocol/universal-router-sdk'
import { AllowanceTransfer, type PermitSingleWithSignature } from '@sun-protocol/permit2-sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { tronWebNile, tronWebMainnet, NILE, MAINNET, getSwapConstants, toEvmHex, toBase58 } from './helper'

const tronWeb = tronWebNile
// ---------------------------------------------------------------------------
// Router API
// ---------------------------------------------------------------------------

interface RouterAPIParams {
  fromToken: string
  toToken: string
  amountIn: string
  typeList?: string
  maxCost?: number
  amountInReferralBips?: number
  amountOutReferralBips?: number
  slippageBips?: number
}

interface RouterAPIResponse {
  code: number
  message: string
  data: any[]
}

async function fetchRouterAPI(params: RouterAPIParams, baseUrl: string): Promise<RouterAPIResponse> {
  const {
    fromToken,
    toToken,
    amountIn,
    typeList = '',
    maxCost = 3,
    amountInReferralBips,
    amountOutReferralBips,
    slippageBips,
  } = params

  const url = new URL('/swap/routerUniversal', baseUrl)
  url.searchParams.append('fromToken', fromToken)
  url.searchParams.append('toToken', toToken)
  url.searchParams.append('amountIn', amountIn)
  url.searchParams.append('typeList', typeList)
  url.searchParams.append('maxCost', maxCost.toString())
  url.searchParams.append('includeUnverifiedV4Hook', 'true')
  if (amountInReferralBips != null) {
    url.searchParams.append('amountInReferralBips', amountInReferralBips.toString())
  }
  if (amountOutReferralBips != null) {
    url.searchParams.append('amountOutReferralBips', amountOutReferralBips.toString())
  }
  if (slippageBips != null) {
    url.searchParams.append('slippageBips', slippageBips.toString())
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Router API HTTP error: ${response.status}`)
  }

  const data = (await response.json()) as RouterAPIResponse
  if (data.code !== 0) {
    throw new Error(`Router API error: ${data.message}`)
  }
  return data
}

// ---------------------------------------------------------------------------
// Main swap
// ---------------------------------------------------------------------------

export interface SwapParams {
  tokenIn: string
  tokenOut: string
  amountIn: string
  network?: string
  slippageBips?: number
  amountInReferralBps?: number
  amountOutReferralBps?: number
  referralProjectAddress?: string
}

export interface SwapResult {
  txid: string
  route: {
    amountIn: string
    amountOut: string
    symbols: string[]
    poolVersions: string[]
    impact: string
  }
}

export async function executeSwap(params: SwapParams): Promise<SwapResult> {
  const network = params.network || 'mainnet'
  const constants = getSwapConstants(network)
  const slippageBips = params.slippageBips ?? 50
  const isTestnet = network === 'nile'
  const deadline = (Math.floor(Date.now() / 1000) + 36000).toString() // 1 hour from now
  const sigDeadline = (Math.floor(Date.now() / 1000) + 3600).toString()
  const debugMode = true

  // 1. Fetch route
  const route = await fetchRouterAPI(
    {
      fromToken: params.tokenIn,
      toToken: params.tokenOut,
      amountIn: params.amountIn,
      amountInReferralBips: params.amountInReferralBps,
      amountOutReferralBips: params.amountOutReferralBps,
      slippageBips: slippageBips,
    },
    constants.routerApiUrl
  )

  if (!route.data || route.data.length === 0) {
    throw new Error('No route found for the given token pair and amount')
  }

  const targetRoute = route.data[0]

  // pretty print targetRoute
  console.log(
    'targetRoute',
    JSON.stringify(targetRoute, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  )

  // 2. Permit2 flow (skip for native TRX)
  let permitSingleWithSignature: PermitSingleWithSignature | undefined
  if (params.tokenIn !== constants.trx) {
    await approveToPermit2(constants.permit2, params.tokenIn, BigInt(params.amountIn))

    const permit2 = new AllowanceTransfer(tronWeb, constants.permit2, isTestnet)
    permitSingleWithSignature = await permit2.generatePermitSignature(
      {
        owner: tronWeb.defaultAddress.base58 as string,
        token: params.tokenIn,
        amount: BigInt(params.amountIn),
        deadline: deadline,
      },
      constants.universalRouter,
      sigDeadline
    )
  }

  // 3. Parse route & build trade
  const swapTradeRoute = parseRouteAPIResponse(targetRoute, isTestnet)

  //prettify swapTradeRoute
  console.log(
    'swapTradeRoute',
    JSON.stringify(swapTradeRoute, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  )

  let referralOptions: ReferralOptions | undefined
  if (params.amountInReferralBps && params.referralProjectAddress) {
    referralOptions = { mode: 'input', bps: params.amountInReferralBps, projectAddress: params.referralProjectAddress }
  } else if (params.amountOutReferralBps && params.referralProjectAddress) {
    referralOptions = {
      mode: 'output',
      bps: params.amountOutReferralBps,
      projectAddress: params.referralProjectAddress,
    }
  }

  const tradePlanner = new TradePlanner([swapTradeRoute], debugMode, {
    permitOptions: {
      permit: permitSingleWithSignature,
    },
    referralOptions,
  })

  if (debugMode) {
    console.log('')
    console.log('// ---------------------------------------------------------------------------')
    console.log('// TradePlanner.encode')
    console.log('// ---------------------------------------------------------------------------')
  }
  tradePlanner.encode()
  if (debugMode) {
    console.log('// ---------------------------------------------------------------------------')
    console.log('')
  }

  // 4. Build, sign, and broadcast
  try {
    const callValue = params.tokenIn === constants.trx ? params.amountIn : '0'
    const txDeadline = Math.floor(Date.now() / 1000) + 3600

    const functionSelector = 'execute(bytes,bytes[],uint256)'

    const parameter = [
      { type: 'bytes', value: tradePlanner.commands },
      { type: 'bytes[]', value: tradePlanner.inputs },
      { type: 'uint256', value: txDeadline },
    ]

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      constants.universalRouter,
      functionSelector,
      {
        callValue: Number(callValue),
        feeLimit: 500_000_000,
      },
      parameter,
      undefined
    )

    const signedTx = await tronWeb.trx.sign(transaction.transaction)

    const result = await tronWeb.trx.sendRawTransaction(signedTx)

    return {
      txid: result.txid,
      route: {
        amountIn: targetRoute.amountIn,
        amountOut: targetRoute.amountOut,
        symbols: targetRoute.symbols,
        poolVersions: targetRoute.poolVersions,
        impact: targetRoute.impact,
      },
    }
  } catch (error) {
    console.error('Transaction failed', error)
    throw new Error('Transaction failed')
  }
}

export const approveToPermit2 = async (permit2Address: string, tokenAddress: string, amount: bigint) => {
  if (tokenAddress.startsWith('0x')) {
    tokenAddress = toBase58(tokenAddress)
  }

  const approveTx = await tronWeb.transactionBuilder.triggerSmartContract(
    tokenAddress,
    'approve(address,uint256)',
    {
      feeLimit: 100000000,
      callValue: 0,
    },
    [
      {
        type: 'address',
        value: toEvmHex(permit2Address),
      },
      {
        type: 'uint256',
        value: amount.toString(),
      },
    ]
  )

  if (approveTx.result && approveTx.result.result) {
    const signed = await tronWeb.trx.sign(approveTx.transaction)
    const res = await tronWeb.trx.sendRawTransaction(signed)
    console.log('✅ Approve transaction sent', res)
    //sleep
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}

if (require.main === module) {
  const TRX_ADDRESS: string = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
  const USDT_ADDRESS: string = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
  const SUN_ADDRESS: string = 'TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk'
  const WIN_ADDRESS: string = 'TNDSHKGBmgRx9mDYA9CnxPx55nu672yQw2'
  const USDJ_ADDRESS: string = 'TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL'
  ;(async () => {
    console.log('============================================================')
    console.log(' Universal Router Swap (NILE testnet)')
    console.log('============================================================')
    console.log('')
    console.log('Executing swap:')
    console.log(`  From: USDT (${USDT_ADDRESS})`)
    console.log(`  To  : TRX  (${TRX_ADDRESS})`)
    console.log(`  Amount In: 1,000 USDT (1,000,000,000 wei-like units)`)
    console.log('')

    try {
      const result = await executeSwap({
        tokenIn: USDT_ADDRESS,
        tokenOut: TRX_ADDRESS,
        amountIn: '1000000',
        network: 'nile',
        // amountInReferralBps: 100,
        // referralProjectAddress: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
      })

      console.log('--------------------------- RESULT -------------------------')
      console.log(`Transaction ID:`)
      console.log(`  ${result.txid}`)
      console.log('')
      console.log('Route summary:')
      console.log(`  Amount In : ${result.route.amountIn}`)
      console.log(`  Amount Out: ${result.route.amountOut}`)
      console.log(`  Symbols   : ${result.route.symbols.join(' -> ')}`)
      console.log(`  Pools     : ${result.route.poolVersions.join(' -> ')}`)
      console.log(`  Price impact: ${result.route.impact}`)
      console.log('------------------------------------------------------------')

      process.exit(0)
    } catch (e) {
      console.error('')
      console.error('Swap failed.')
      if (e instanceof Error) {
        console.error(`Reason: ${e.message}`)
      } else {
        console.error(e)
      }
      process.exit(1)
    }
  })()
}
