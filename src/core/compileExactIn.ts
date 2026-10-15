import { zeroAddress } from 'viem'
import { ADDRESS_THIS, CONTRACT_BALANCE, MSG_SENDER } from '../constants/constants'
import { ACTIONS, ACTION_CONSTANTS } from '../packages/v4/constants/actions'
import { ActionsPlanner } from '../packages/v4/entities/ActionsPlanner'
import {
  EncodedMultiSwapInParams,
  EncodedPathKey,
  EncodedPoolKey,
  EncodedSingleSwapInParams,
} from '../packages/v4/types'
import {
  Address,
  CommandType,
  Currency,
  ExactInSwapExecutionPlan,
  Pool,
  PoolType,
  RouteType,
  SwapExecutionContext,
  SwapSection,
  V4Pool
} from '../types'
import {
  encodeHTXSunSwapToPathAndFlags,
  encodePSMSwapToPathAndFlags,
  encodeStableRouteToPathAndFlags,
  encodeV1RouteToPath,
  encodeV2RouteToPath,
  encodeV3RouteToPath,
} from './encodePath'

import { addPayReferral, addPermit, addPermit2TransferFrom, addSweep,
  CommandWriter, normalizeParameters, validateReferralOptions } from './compiler'

type ExactInContext = Omit<SwapExecutionContext, 'plans'> & { plans: ExactInSwapExecutionPlan[] }

export class ExactInCompiler {
  private addCommand: CommandWriter['addCommand']
  private debugLog: CommandWriter['debugLog']

  constructor(private context: ExactInContext, private writer: CommandWriter) {
    this.addCommand = writer.addCommand
    this.debugLog = writer.debugLog
  }

  compile(): void {
    if (this.context.plans.length === 0) {
      throw new Error('No plans to encode')
    }

    const referral = this.context.options?.referralOptions
    const isOneShotTransfer = this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false

    validateReferralOptions(this.context.options?.referralOptions)

    if (this.context.options?.permitOptions?.permit) {
      addPermit(this.writer, this.context.options.permitOptions.permit)
    }

    if (!isOneShotTransfer) {
      if (referral?.mode === 'input') {
        // Case 3: non-oneShotTransfer + input deduction
        // Per plan: transfer to router, PAY_REFERRAL, then swaps from CONTRACT_BALANCE
        for (const plan of this.context.plans) {
          if (plan.sections.length === 0) throw new Error('No sections to encode')
          if (!plan.input.isNative) {
            addPermit2TransferFrom(this.writer, plan.input, ADDRESS_THIS, plan.amountIn)
          }
          this.addPayReferral(plan.input, referral.projectAddress, referral.bps)
          for (const section of plan.sections) {
            this.addSwap(plan, section)
          }
          this.addSweep(plan)
        }
      } else {
        // No referral, or Case 4: non-oneShotTransfer + output deduction
        for (const plan of this.context.plans) {
          if (plan.sections.length === 0) throw new Error('No sections to encode')
          for (const section of plan.sections) {
            this.addSwap(plan, section)
          }
          if (referral?.mode === 'output') {
            this.addPayReferral(plan.output, referral.projectAddress, referral.bps)
          }
          this.addSweep(plan)
        }
      }
    } else {
      // oneShotTransfer
      if (referral?.mode === 'output') {
        throw new Error('Output referral with oneShotTransfer is not supported')
      }

      let totalAmountIn = 0n
      for (const plan of this.context.plans) {
        totalAmountIn += plan.amountIn
      }
      const firstPlan = this.context.plans[0]
      if (!firstPlan.input.isNative) {
        addPermit2TransferFrom(this.writer, firstPlan.input, ADDRESS_THIS, totalAmountIn)
      }

      // Case 1: oneShotTransfer + input deduction
      if (referral?.mode === 'input') {
        this.addPayReferral(firstPlan.input, referral.projectAddress, referral.bps)
      }

      for (let i = 0; i < this.context.plans.length; i++) {
        this.context.plans[i].spiltOptions = {
          enabled: true,
          sequence: i,
          isFirstSpilt: i === 0,
          isLastSpilt: i === this.context.plans.length - 1,
        }
        for (const section of this.context.plans[i].sections) {
          this.addSwap(this.context.plans[i], section)
        }
        this.addSweep(this.context.plans[i])
      }
    }
  }

  private addSweep(plan: ExactInSwapExecutionPlan) {
    addSweep(this.writer, plan.output, plan.recipient ?? MSG_SENDER, plan.minimumAmountOut)
  }

  private addSwap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    switch (section.type) {
      case RouteType.WTRX:
        this.addWTRX(plan, section)
        break
      case RouteType.V1:
        this.addV1Swap(plan, section)
        break
      case RouteType.V2:
        this.addV2Swap(plan, section)
        break
      case RouteType.V3:
        this.addV3Swap(plan, section)
        break
      case RouteType.V4:
        this.addV4Swap(plan, section)
        break
      case RouteType.STABLE:
        this.addStableSwap(plan, section)
        break
      case RouteType.PSM:
        this.addPSMSwap(plan, section)
        break
      case RouteType.HTX_SUN:
        this.addHTXSunSwap(plan, section)
        break
      default:
        throw new Error('Invalid route type')
    }
  }

  private addWTRX(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length !== 1) {
      throw new Error('WTRX pool must have exactly one pool')
    }
    const wrap = section.currencyInput.isNative

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n

    if (wrap) {
      this.debugLog('WRAP_ETH', { recipient, amountIn })
      this.addCommand(CommandType.WRAP_ETH, [recipient, amountIn])
    } else {
      this.debugLog('UNWRAP_WETH', { recipient, amountOutMinimum })
      this.addCommand(CommandType.UNWRAP_WETH, [recipient, amountOutMinimum])
    }
  }

  private addV1Swap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V1 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const path = encodeV1RouteToPath(section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V1_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, payerIsUser })

    this.addCommand(CommandType.V1_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, payerIsUser])
  }

  private addV2Swap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V2 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const path = encodeV2RouteToPath(section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V2_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, payerIsUser })

    this.addCommand(CommandType.V2_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, payerIsUser])
  }

  private addV3Swap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V3 section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const { encodedPath, path, types } = encodeV3RouteToPath(section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V3_SWAP_EXACT_IN', {
      recipient,
      amountIn,
      amountOutMinimum,
      path,
      types,
      encodedPath,
      payerIsUser,
    })

    this.addCommand(CommandType.V3_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, encodedPath, payerIsUser])
  }

  private addV4Swap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    const planner = new ActionsPlanner()

    if (section.pools.length === 0) {
      throw new Error('V4 section must contain at least one pool')
    }
    this.initV4Swap(planner, plan, section)

    if (section.pools.length === 1) {
      this.addV4SwapSingleHop(planner, plan, section)
    } else {
      this.addV4SwapMultiHop(planner, plan, section)
    }

    this.finalizeV4Swap(planner, plan, section)
  }

  private initV4Swap(planner: ActionsPlanner, plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.type !== RouteType.V4) {
      throw new Error('V4 swap must be a V4 pool')
    }
    const amountIn = this.getAmountIn(plan, section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V4_SETTLE', { amountIn, payerIsUser, currencyIn: section.currencyInput.hex })

    planner.add(ACTIONS.SETTLE, [section.currencyInput.hex, amountIn, payerIsUser])
  }

  private finalizeV4Swap(planner: ActionsPlanner, plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.type !== RouteType.V4) {
      throw new Error('V4 swap must be a V4 pool')
    }

    const recipient = ADDRESS_THIS.hex

    this.debugLog('V4_TAKE', { recipient })

    planner.add(ACTIONS.TAKE, [section.currencyOutput.hex, recipient, ACTION_CONSTANTS.OPEN_DELTA])

    if (section.isFirstSection) {
      planner.add(ACTIONS.TAKE, [section.currencyInput.hex, recipient, ACTION_CONSTANTS.OPEN_DELTA])
    }

    this.addCommand(CommandType.V4_SWAP, [planner.encodeActions(), planner.encodePlans()])
  }

  private addV4SwapSingleHop(planner: ActionsPlanner, plan: ExactInSwapExecutionPlan, section: SwapSection) {
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

    const swapParams: EncodedSingleSwapInParams = {
      poolKey: encodedPoolKey,
      zeroForOne: section.currencyInput.Equal(pool.currency0),
      hookData: zeroAddress,
      amountIn: ACTION_CONSTANTS.OPEN_DELTA,
      amountOutMinimum: 0n,
    }

    this.debugLog('V4_CL_SWAP_EXACT_IN_SINGLE', { encodedPoolKey, swapParams })

    planner.add(ACTIONS.CL_SWAP_EXACT_IN_SINGLE, [swapParams])
  }

  private addV4SwapMultiHop(planner: ActionsPlanner, plan: ExactInSwapExecutionPlan, section: SwapSection) {
    const swapParams: EncodedMultiSwapInParams = {
      amountIn: ACTION_CONSTANTS.OPEN_DELTA,
      amountOutMinimum: 0n,
      currencyIn: section.currencyInput.hex,
      path: section.pools.map((pool, index) => {
        pool = pool as V4Pool
        if (pool.type !== PoolType.V4) {
          throw new Error('Pool must be a V4 pool')
        }

        const midCurrency =
          index === section.pools.length - 1
            ? this.getMidCurrency(section.pools[index - 1], pool).Equal(pool.currency0)
              ? pool.currency1
              : pool.currency0
            : this.getMidCurrency(pool, section.pools[index + 1])

        return {
          intermediateCurrency: midCurrency.hex,
          fee: pool.fee,
          hooks: pool.hooks.hex,
          hookData: zeroAddress,
          parameters: normalizeParameters(pool.parameters),
        } as EncodedPathKey
      }),
    }

    this.debugLog('V4_CL_SWAP_EXACT_IN', { swapParams })

    planner.add(ACTIONS.CL_SWAP_EXACT_IN, [swapParams])
  }

  private addStableSwap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    //     'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, uint256[] flag, bool payerIsUser'
    if (section.pools.length === 0) {
      throw new Error('Stable section must contain at least one pool')
    }
    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodeStableRouteToPathAndFlags(section)

    this.debugLog('STABLE_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.STABLE_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private addPSMSwap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('PSM section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodePSMSwapToPathAndFlags(section)

    this.debugLog('PSM_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.PSM_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private addHTXSunSwap(plan: ExactInSwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('HTX Sun section must contain at least one pool')
    }

    const recipient = ADDRESS_THIS.hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = 0n
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodeHTXSunSwapToPathAndFlags(section)

    this.debugLog('HTX_SUN_SWAP_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.HTX_SUN_SWAP_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private getAmountIn(plan: ExactInSwapExecutionPlan, section: SwapSection): bigint {
    if (this.isInputReferralWithExplicitTransfer() || !section.isFirstSection) return CONTRACT_BALANCE

    const oneShotTransfer = this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false
    if (oneShotTransfer) return plan.spiltOptions?.isLastSpilt ? CONTRACT_BALANCE : plan.amountIn

    const nativeBalanceProtocol = section.type === RouteType.V1 ||
      section.type === RouteType.STABLE || section.type === RouteType.PSM || section.type === RouteType.HTX_SUN
    return nativeBalanceProtocol && section.currencyInput.isNative ? CONTRACT_BALANCE : plan.amountIn
  }

  private getPayerIsUser(section: SwapSection): boolean {
    // Case 3: funds already in the router from explicit transfer
    if (this.isInputReferralWithExplicitTransfer()) {
      return false
    }

    return (
      section.isFirstSection &&
      !section.currencyInput.isNative &&
      !this.context.options?.tradeSpiltOptions?.oneShotTransfer
    )
  }

  private addPayReferral(token: Currency, projectAddress: string, bps: number) {
    addPayReferral(this.writer, token, new Address(projectAddress), bps)
  }

  private isInputReferralWithExplicitTransfer(): boolean {
    const referral = this.context.options?.referralOptions
    const isOneShotTransfer = this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false
    return !!referral && referral.mode === 'input' && !isOneShotTransfer
  }

  private getMidCurrency = (step0: Pool, step1: Pool): Currency => {
    if (step0.currency0.Equal(step1.currency0) && step0.currency1.Equal(step1.currency1)) {
      throw new Error('Same step')
    }

    if (step0.currency0.Equal(step1.currency0) || step0.currency0.Equal(step1.currency1)) {
      return step0.currency0
    }

    if (step0.currency1.Equal(step1.currency0) || step0.currency1.Equal(step1.currency1)) {
      return step0.currency1
    }

    throw new Error('Invalid steps no mid currency')
  }


}
