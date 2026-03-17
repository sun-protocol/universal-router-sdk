import { TradePlanner, parseRouteAPIResponse, type ParseRouteOptions } from '@sun-protocol/universal-router-sdk'
import { AllowanceTransfer, type PermitSingleWithSignature } from '@sun-protocol/permit2-sdk'
import * as dotenv from 'dotenv'
import { TronWeb } from 'tronweb'

dotenv.config()

const tronWeb = new TronWeb(
  'https://nile.trongrid.io', // fullNode
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  process.env.PRIVATE_KEY ?? ''
)

// ---------------------------------------------------------------------------
// Network-level swap/router constants (Universal Router + Permit2)
// ---------------------------------------------------------------------------

export interface NetworkConstants {
  trx: string
}

export interface SwapConstants extends NetworkConstants {
  universalRouter: string
  permit2: string
  routerApiUrl: string
}

export const MAINNET: SwapConstants = {
  universalRouter: 'TSJEtPuqHpvSaVnSwvCsngaeBxrGUzp95Q',
  permit2: 'TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9',
  routerApiUrl: 'https://rot.endjgfsv.link',
  trx: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
}

export const NILE: SwapConstants = {
  universalRouter: 'TEgq4237arNE7jX74KCDkc1MXdZeWNkGVj',
  permit2: 'TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h',
  routerApiUrl: 'https://tnrouter.endjgfsv.link',
  trx: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
}

function getSwapConstants(network: string): SwapConstants {
  if (network === 'mainnet') {
    return MAINNET
  } else if (network === 'nile') {
    return NILE
  } else {
    throw new Error(`Swap is not supported on network "${network}". Supported: mainnet, nile`)
  }
}

// ---------------------------------------------------------------------------
// Router API
// ---------------------------------------------------------------------------

interface RouterAPIParams {
  fromToken: string
  toToken: string
  amountIn: string
  typeList?: string
  maxCost?: number
}

interface RouterAPIResponse {
  code: number
  message: string
  data: any[]
}

async function fetchRouterAPI(params: RouterAPIParams, baseUrl: string): Promise<RouterAPIResponse> {
  const { fromToken, toToken, amountIn, typeList = '', maxCost = 3 } = params

  const url = new URL('/swap/routerUniversal', baseUrl)
  url.searchParams.append('fromToken', fromToken)
  url.searchParams.append('toToken', toToken)
  url.searchParams.append('amountIn', amountIn)
  url.searchParams.append('typeList', typeList)
  url.searchParams.append('maxCost', maxCost.toString())
  url.searchParams.append('includeUnverifiedV4Hook', 'true')

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
  slippage?: number
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
  const slippage = params.slippage ?? 0.005
  const isTestnet = network === 'nile'
  const deadline = (Math.floor(Date.now() / 1000) + 36000).toString() // 1 hour from now
  const sigDeadline = (Math.floor(Date.now() / 1000) + 3600).toString()
  const debugMode = false

  // 1. Fetch route
  const route = await fetchRouterAPI(
    {
      fromToken: params.tokenIn,
      toToken: params.tokenOut,
      amountIn: params.amountIn,
    },
    constants.routerApiUrl
  )

  if (!route.data || route.data.length === 0) {
    throw new Error('No route found for the given token pair and amount')
  }

  const targetRoute = route.data[0]

  // 2. Permit2 flow (skip for native TRX)
  let permitSingleWithSignature: PermitSingleWithSignature | undefined
  if (params.tokenIn !== constants.trx) {
    await approveToPermit2(constants.permit2, params.tokenIn, BigInt(params.amountIn))

    const permit2 = new AllowanceTransfer(tronWeb, constants.permit2, true)
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
  const swapTradeRoute = parseRouteAPIResponse(targetRoute, isTestnet, {
    slippage,
  } as ParseRouteOptions)

  const tradePlanner = new TradePlanner([swapTradeRoute], debugMode, {
    permitOptions: {
      permitEnabled: !!permitSingleWithSignature,
      permit: permitSingleWithSignature,
    },
  })
  tradePlanner.encode()

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

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function toEvmHex(addr: string): string {
  const hex = tronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body
}

export function toBase58(addr: string): string {
  return TronWeb.address.fromHex(addr)
}

if (require.main === module) {
  const TRX_ADDRESS: string = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
  const USDT_ADDRESS: string = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'

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
        amountIn: '1000000000',
        network: 'nile',
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
