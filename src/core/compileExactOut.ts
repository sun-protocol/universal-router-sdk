import { Hex } from 'viem'
import { ADDRESS_THIS, MSG_SENDER } from '../constants/constants'
import { ACTIONS, ACTION_CONSTANTS } from '../packages/v4/constants/actions'
import { ActionsPlanner } from '../packages/v4/entities/ActionsPlanner'
import {
  EncodedPoolKey
} from '../packages/v4/types'
import {
  Address,
  CommandType,
  ExactOutSwapExecutionPlan,
  PoolType,
  RouteType,
  SwapExecutionContext,
  SwapSection,
  V4Pool
} from '../types'
import {
  encodePSMSwapToPathAndFlags,
  encodeV1RouteToPath,
  encodeV2RouteToPath,
  encodeV3RouteToPath
} from './encodePath'
import { exactOutAddress } from './exactOut'
import { nextCurrency } from './routePath'

import { addPayReferral, addPermit, addPermit2TransferFrom, addSweep,
  CommandWriter, normalizeParameters, validateReferralOptions } from './compiler'

type ExactOutContext = Pick<SwapExecutionContext, 'options'> & { plan: ExactOutSwapExecutionPlan }

export class ExactOutCompiler {
  private addCommand: CommandWriter['addCommand']
  private debugLog: CommandWriter['debugLog']

  constructor(private context: ExactOutContext, private writer: CommandWriter) {
    this.addCommand = writer.addCommand
    this.debugLog = writer.debugLog
  }

  compile(): void {
    const { plan } = this.context
    validateReferralOptions(this.context.options?.referralOptions)
    const pureWrap = plan.sections.length === 1 && plan.sections[0].type === RouteType.WTRX
    const referral = this.context.options?.referralOptions
    if (referral?.mode === 'input') {
      throw new Error('Exact-Out input referral is not supported; use output referral')
    }
    const bps = plan.outputReferralBips
    if (bps ? !referral || referral.mode !== 'output' || referral.bps !== bps : referral && referral.bps !== 0) {
      throw new Error('Exact-Out referral options must match the quote')
    }
    if (referral) exactOutAddress(referral.projectAddress)
    if (this.context.options?.tradeSpiltOptions?.enable || this.context.options?.tradeSpiltOptions?.oneShotTransfer) {
      throw new Error('Exact-Out split options are not supported')
    }
    if (this.context.options?.permitOptions?.permit) {
      addPermit(this.writer, this.context.options.permitOptions.permit)
    }

    if (pureWrap && !plan.input.isNative) {
      addPermit2TransferFrom(this.writer, plan.input, ADDRESS_THIS, plan.amountIn)
    }
    for (const section of plan.sections) this.addSwap(plan, section)
    if (plan.outputReferralBips) {
      addPayReferral(this.writer, plan.output, new Address(exactOutAddress(referral!.projectAddress)), referral!.bps)
    }
    addSweep(this.writer, plan.output, plan.recipient ?? MSG_SENDER, plan.amountOut)

    if (plan.input.isNative || plan.sections.some(section => section.type === RouteType.V1)) {
      const recipient = plan.recipient ?? MSG_SENDER
      if (!pureWrap && plan.sections[0].type === RouteType.WTRX) {
        this.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS.hex, 0n])
      }
      this.addCommand(CommandType.SWEEP, [plan.input.hex, recipient.hex, 0n])
    }
  }

  private addSwap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    switch (section.type) {
      case RouteType.WTRX: return this.addWTRX(plan, section)
      case RouteType.V1: return this.addV1Swap(plan, section)
      case RouteType.V2: return this.addV2Swap(plan, section)
      case RouteType.V3: return this.addV3Swap(plan, section)
      case RouteType.V4: return this.addV4Swap(plan, section)
      case RouteType.PSM: return this.addPSMSwap(plan, section)
      default: throw new Error('Unsupported Exact-Out route type')
    }
  }
  private addWTRX(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length !== 1) throw new Error('WTRX pool must have exactly one pool')
    const recipient = ADDRESS_THIS.hex
    if (section.currencyInput.isNative) {
      const amountIn = plan.sections.length === 1 ? plan.grossAmountOut : plan.maximumAmountIn
      this.debugLog('WRAP_ETH', { recipient, amountIn })
      this.addCommand(CommandType.WRAP_ETH, [recipient, amountIn])
    } else {
      this.debugLog('UNWRAP_WETH', { recipient, amountOutMinimum: 0n })
      this.addCommand(CommandType.UNWRAP_WETH, [recipient, 0n])
    }
  }

  private addV1Swap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V1 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const path = encodeV1RouteToPath(section)
    const payerIsUser = section.isFirstSection && !section.currencyInput.isNative

    this.debugLog('V1_SWAP_EXACT_OUT', {
      recipient, amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn, path, payerIsUser
    })
    this.addCommand(CommandType.V1_SWAP_EXACT_OUT, [recipient, plan.grossAmountOut,
      plan.maximumAmountIn, path, payerIsUser])
  }

  private addV2Swap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V2 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const path = encodeV2RouteToPath(section)
    const payerIsUser = section.isFirstSection && !section.currencyInput.isNative

    this.debugLog('V2_SWAP_EXACT_OUT', {
      recipient, amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn, path, payerIsUser
    })
    this.addCommand(CommandType.V2_SWAP_EXACT_OUT, [recipient, plan.grossAmountOut,
      plan.maximumAmountIn, path, payerIsUser])
  }

  private addV3Swap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V3 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const { encodedPath, path, types } = encodeV3RouteToPath(section, true)
    const payerIsUser = section.isFirstSection && !section.currencyInput.isNative

    this.debugLog('V3_SWAP_EXACT_OUT', {
      recipient, amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn,
      path, types, encodedPath, payerIsUser
    })
    this.addCommand(CommandType.V3_SWAP_EXACT_OUT, [recipient, plan.grossAmountOut,
      plan.maximumAmountIn, encodedPath, payerIsUser])
  }

  private addPSMSwap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('PSM section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const payerIsUser = section.isFirstSection && !section.currencyInput.isNative

    const { path, flags } = encodePSMSwapToPathAndFlags(section)

    this.debugLog('PSM_SWAP_EXACT_OUT', {
      recipient, amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn, path, flags, payerIsUser
    })
    this.addCommand(CommandType.PSM_SWAP_EXACT_OUT, [recipient, plan.grossAmountOut,
      plan.maximumAmountIn, path, flags, payerIsUser])
  }

  private addV4Swap(plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) throw new Error('V4 section must contain at least one pool')
    const planner = new ActionsPlanner()
    if (section.pools.length === 1) this.addV4SwapSingleHop(planner, plan, section)
    else this.addV4SwapMultiHop(planner, plan, section)
    const payerIsUser = section.isFirstSection && !section.currencyInput.isNative
    if (payerIsUser) {
      this.debugLog('V4_SETTLE_ALL', { currencyIn: section.currencyInput.hex, amountInMaximum: plan.maximumAmountIn })
      planner.add(ACTIONS.SETTLE_ALL, [section.currencyInput.hex, plan.maximumAmountIn])
    } else {
      this.debugLog('V4_SETTLE', { currencyIn: section.currencyInput.hex, amountIn: ACTION_CONSTANTS.OPEN_DELTA, payerIsUser: false })
      planner.add(ACTIONS.SETTLE, [section.currencyInput.hex, ACTION_CONSTANTS.OPEN_DELTA, false])
    }
    const recipient = ADDRESS_THIS.hex
    this.debugLog('V4_TAKE', { recipient })
    planner.add(ACTIONS.TAKE, [section.currencyOutput.hex, recipient, ACTION_CONSTANTS.OPEN_DELTA])
    this.addCommand(CommandType.V4_SWAP, [planner.encodeActions(), planner.encodePlans()])
  }

  private addV4SwapSingleHop(planner: ActionsPlanner, plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    const pool = section.pools[0] as V4Pool
    if (pool.type !== PoolType.V4) {
      throw new Error('Pool must be a V4 pool')
    }

    const encodedPoolKey: EncodedPoolKey = {
      currency0: pool.currency0.hex,
      currency1: pool.currency1.hex,
      hooks: pool.hooks.hex,
      fee: pool.fee,
      parameters: normalizeParameters(pool.parameters),
    }

    const swapParams = {
      poolKey: encodedPoolKey,
      zeroForOne: section.currencyInput.Equal(pool.currency0),
      hookData: '0x' as Hex,
      amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn,
    }
    this.debugLog('V4_CL_SWAP_EXACT_OUT_SINGLE', { swapParams })
    planner.add(ACTIONS.CL_SWAP_EXACT_OUT_SINGLE, [swapParams])
  }

  private addV4SwapMultiHop(planner: ActionsPlanner, plan: ExactOutSwapExecutionPlan, section: SwapSection) {
    let currency = section.currencyInput
    const path = section.pools.map(pool => {
      if (pool.type !== PoolType.V4) throw new Error('Pool must be a V4 pool')
      const intermediateCurrency = currency.hex
      currency = nextCurrency(pool, currency)
      return {
        intermediateCurrency, fee: pool.fee, hooks: pool.hooks.hex,
        hookData: '0x' as Hex, parameters: normalizeParameters(pool.parameters)
      }
    })
    // The local router iterates this array backwards; each entry names the forward input.
    const swapParams = {
      currencyOut: section.currencyOutput.hex, path,
      amountOut: plan.grossAmountOut,
      amountInMaximum: plan.maximumAmountIn,
    }
    this.debugLog('V4_CL_SWAP_EXACT_OUT', { swapParams })
    planner.add(ACTIONS.CL_SWAP_EXACT_OUT, [swapParams])
  }

}
