import {
  TradePlanner,
  type SwapTradeRoute,
  type PoolKey,
  PoolVersion,
  type RouterAPIResponse,
  Currency,
  type Pool,
  newV1Pool,
  newV2Pool,
  newV3Pool,
  newV4Pool,
  newStablePool,
  newPSMPool,
  newHTXSunPool,
  newWTRXPool,
  getPoolFlag,
} from '@sun-protocol/universal-router-sdk'
import { AllowanceTransfer, type PermitSingleWithSignature } from '@sun-protocol/permit2-sdk'
import {
  tronWebNile,
  tronWebMainnet,
  NILE,
  MAINNET,
  getSwapConstants,
  toBase58,
  toEvmHex,
  SwapConstants,
} from './helper'
import { TRX_ADDRESS, TESTNET_WTRX_ADDRESS, MAINNET_WTRX_ADDRESS } from '@sun-protocol/universal-router-sdk'

const approveToPermit2 = async (
  tronWeb: typeof tronWebNile,
  permit2Address: string,
  tokenAddress: string,
  amount: bigint
) => {
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
    await new Promise(resolve => setTimeout(resolve, 3000))
  } else {
    throw new Error('approve transaction build failed')
  }
}

export interface Path {
  poolVersion: PoolVersion
  tokenIn: string
  tokenOut: string
  fee: string // "500" -> "0.0005" -> 0.05% fee
  poolKey: PoolKey | null // only for v4 / special pools
}

export interface SwapWithoutApiParams {
  amountIn: string
  paths: Path[]
  network?: 'mainnet' | 'nile'
  slippageBps?: number // e.g. 50 = 0.5%
  /**
   * Optional expected amountOut (raw units) used to compute minimumAmountOut with slippage.
   * If not provided, minimumAmountOut will be 0 (no min constraint).
   */
  expectedAmountOutRaw?: string
  submit?: boolean
}

export async function swapWithoutApi(params: SwapWithoutApiParams): Promise<string> {
  const { amountIn, paths } = params
  if (!paths.length) {
    throw new Error('paths must not be empty')
  }

  const network = params.network ?? 'nile'
  const slippageBps = params.slippageBps ?? 50
  const submit = params.submit ?? true

  const tronWeb = network === 'nile' ? tronWebNile : tronWebMainnet
  const constants: SwapConstants = getSwapConstants(network)
  const isTestnet = network === 'nile'
  const debugMode = true

  const deadline = (Math.floor(Date.now() / 1000) + 36000).toString() // 1 hour from now
  const sigDeadline = (Math.floor(Date.now() / 1000) + 3600).toString()

  const fromToken = paths[0].tokenIn
  const toToken = paths[paths.length - 1].tokenOut

  let permitSingleWithSignature: PermitSingleWithSignature | undefined
  if (fromToken !== constants.trx) {
    if (submit) {
      try {
        await approveToPermit2(tronWeb, constants.permit2, fromToken, BigInt(amountIn))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
          `approveToPermit2 failed (network=${network}, token=${fromToken}, permit2=${constants.permit2}): ${msg}`
        )
      }
    }
    const permit2 = new AllowanceTransfer(tronWeb, constants.permit2, isTestnet)
    permitSingleWithSignature = await permit2.generatePermitSignature(
      {
        owner: tronWeb.defaultAddress.base58 as string,
        token: fromToken,
        amount: BigInt(amountIn),
        deadline: deadline,
      },
      constants.universalRouter,
      sigDeadline
    )
  }

  // Build pools directly from the provided paths (manual route construction).
  const pools: Pool[] = []
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    let currency0 = new Currency(path.tokenIn)
    let currency1 = new Currency(path.tokenOut)

    // Sort currencies to match on-chain pool ordering
    if (currency0.hex > currency1.hex) {
      ;[currency0, currency1] = [currency1, currency0]
    }

    const wtrxAddress = isTestnet ? TESTNET_WTRX_ADDRESS : MAINNET_WTRX_ADDRESS

    // Workaround for special WTRX pool
    if (
      (currency0.Equal(TRX_ADDRESS) && currency1.Equal(wtrxAddress)) ||
      (currency1.Equal(TRX_ADDRESS) && currency0.Equal(wtrxAddress))
    ) {
      pools.push(newWTRXPool(currency0, currency1))
      continue
    }

    const poolVersion = path.poolVersion
    const fee = Number(path.fee)
    const poolKey = path.poolKey ?? undefined

    switch (poolVersion) {
      case PoolVersion.V1:
        pools.push(newV1Pool(currency0, currency1))
        break
      case PoolVersion.V2:
        pools.push(newV2Pool(currency0, currency1))
        break
      case PoolVersion.V3:
        pools.push(newV3Pool(currency0, currency1, fee))
        break
      case PoolVersion.V4:
        if (!poolKey) {
          throw new Error('poolKey is required for V4 pools')
        }
        pools.push(newV4Pool(currency0, currency1, new Currency(poolKey.hooks), poolKey.fee, poolKey.parameters))
        break
      case PoolVersion.CURVE_2POOL:
      case PoolVersion.CURVE_USDD202POOL:
      case PoolVersion.CURVE_OLD3POOL:
      case PoolVersion.CURVE_OLDUSDCPOOL:
      case PoolVersion.CURVE_2POOLTUSDUSDT:
      case PoolVersion.CURVE_USDC2POOLTUSDUSDT:
      case PoolVersion.CURVE_USDD2POOLTUSDUSDT:
      case PoolVersion.CURVE_USDJ2POOLTUSDUSDT:
        pools.push(newStablePool(currency0, currency1, getPoolFlag(poolVersion)))
        break
      case PoolVersion.PSM_USDT20PSM:
        pools.push(newPSMPool(currency0, currency1, getPoolFlag(poolVersion)))
        break
      case PoolVersion.HTX_SUN:
        pools.push(newHTXSunPool(currency0, currency1, getPoolFlag(poolVersion)))
        break
      case PoolVersion.WTRX:
        pools.push(newWTRXPool(currency0, currency1))
        break
      default:
        throw new Error(`Unsupported pool version: ${poolVersion}`)
    }
  }

  // Compute minimumAmountOut based on optional expectedAmountOutRaw and slippage.
  let minimumAmountOut = 0n
  if (params.expectedAmountOutRaw) {
    const amountOutRawBigInt = BigInt(params.expectedAmountOutRaw)
    const slippage = slippageBps / 10_000 // 10_000 = 100%
    const factor = BigInt(Math.floor((1 - slippage) * 1_000_000))
    minimumAmountOut = (amountOutRawBigInt * factor) / 1_000_000n
    if (minimumAmountOut > amountOutRawBigInt) {
      minimumAmountOut = amountOutRawBigInt
    }
  }

  const swapTradeRoute: SwapTradeRoute = {
    pools,
    input: new Currency(fromToken),
    output: new Currency(toToken),
    amountIn: BigInt(amountIn),
    minimumAmountOut,
  }

  console.log(
    'swapTradeRoute',
    JSON.stringify(swapTradeRoute, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  )

  const tradePlanner = new TradePlanner([swapTradeRoute], debugMode, {
    permitOptions: {
      permit: permitSingleWithSignature,
    },
  })
  tradePlanner.encode()

  console.log(
    'tradePlanner',
    JSON.stringify(tradePlanner, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  )

  if (submit) {
    try {
      const callValue = fromToken === constants.trx ? amountIn : '0'

      const functionSelector = 'execute(bytes,bytes[],uint256)'

      const parameter = [
        { type: 'bytes', value: tradePlanner.commands },
        { type: 'bytes[]', value: tradePlanner.inputs },
        { type: 'uint256', value: Math.floor(Date.now() / 1000) + 3600 },
      ]

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

      console.log('Transaction broadcasted!')
      console.log('TxID:', result.txid)

      await new Promise(resolve => setTimeout(resolve, 1000))

      return result.txid
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('Transaction failed', error)
      throw new Error(`Transaction failed (network=${network}, router=${constants.universalRouter}): ${msg}`)
    }
  }

  throw new Error('Transaction not submitted')
}

export async function trxWtrxLoop(
  amountIn: string,
  iterations: number,
  params?: Omit<SwapWithoutApiParams, 'amountIn' | 'paths'>
): Promise<string> {
  const paths: Path[] = []

  for (let i = 0; i < iterations; i++) {
    paths.push({
      poolVersion: PoolVersion.WTRX,
      tokenIn: i % 2 === 0 ? 'TRX' : 'WTRX',
      tokenOut: i % 2 === 0 ? 'WTRX' : 'TRX',
      fee: '0',
      poolKey: null,
    })
  }

  console.log(`Created ${paths.length} paths for TRX <-> WTRX loop (${iterations} iterations)`)

  return swapWithoutApi({
    amountIn,
    paths,
    ...params,
  })
}

if (require.main === module) {
  ;(async () => {
    console.log('============================================================')
    console.log(' Universal Router Swap (manual route)')
    console.log('============================================================')
    console.log('')

    try {
      const TRX_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
      const USDT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      const CURRENCY1_ADDRESS = 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz'
      const amountIn = '1000000' // 1 USDT (6 decimals)

      const paths: Path[] = [
        {
          poolVersion: PoolVersion.V4,
          tokenIn: USDT_ADDRESS, // input: USDT
          tokenOut: CURRENCY1_ADDRESS, // output: TRX
          fee: '100',
          poolKey: {
            token0: USDT_ADDRESS, // currency0 (will be sorted so TRX < USDT)
            token1: CURRENCY1_ADDRESS, // currency1
            hooks: TRX_ADDRESS, // Matches swap.ts logs (TRX / zero-address hook)
            fee: 100,
            parameters: '0x0000000000000000000000000000000000000000000000000000000000010000',
          },
        },
      ]

      const txid = await swapWithoutApi({
        amountIn,
        paths,
        network: 'mainnet',
        slippageBps: 200, // 0.5% slippage (adjust as needed)
        submit: true, // Set false to preview route/commands without broadcasting
      })

      console.log('--------------------------- RESULT -------------------------')
      console.log('Transaction (not actually submitted in this example):')
      console.log(`  txid: ${txid}`)
      console.log('------------------------------------------------------------')
      process.exit(0)
    } catch (e) {
      console.error('')
      console.error('swapWithoutApi example failed.')
      if (e instanceof Error) {
        console.error(`Reason: ${e.message}`)
      } else {
        console.error(e)
      }
      process.exit(1)
    }
  })()
}
