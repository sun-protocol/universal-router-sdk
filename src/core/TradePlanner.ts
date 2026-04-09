import { buildExecutionFromRoute } from './buildExecutionFromRoute'
import {
  encodeV1RouteToPath,
  encodeV2RouteToPath,
  encodeV3RouteToPath,
  encodeStableRouteToPathAndFlags,
  encodePSMSwapToPathAndFlags,
  encodeHTXSunSwapToPathAndFlags,
} from './encodePath'
import { RoutePlanner } from './RoutePlanner'
import {
  RouteType,
  SwapSection,
  SwapExecutionContext,
  SwapTradeRoute,
  Address,
  Currency,
  PoolType,
  V4Pool,
  Pool,
  CommandType,
  SwapExecutionPlan,
  Permit2Signature,
  SwapExecutionOptions,
} from '../types'
import { ADDRESS_THIS, CONTRACT_BALANCE, MSG_SENDER } from '../constants/constants'
import { ActionsPlanner } from '../packages/v4/entities/ActionsPlanner'
import {
  EncodedPoolKey,
  EncodedSingleSwapInParams,
  EncodedMultiSwapInParams,
  EncodedPathKey,
} from '../packages/v4/types'
import { Hex, zeroAddress } from 'viem'
import { ACTIONS, ACTION_CONSTANTS } from '../packages/v4/constants/actions'

const DEBUG_JSON_INDENT = 2

function debugJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

export class TradePlanner extends RoutePlanner {
  private context: SwapExecutionContext
  private debugMode: boolean
  /** Collected when debug mode is on; flushed as one JSON object at the end of `encode()`. */
  private debugEncodeSteps: Array<Record<string, unknown>> = []

  constructor(
    public routes: SwapTradeRoute[],
    debugMode: boolean = false,
    options: SwapExecutionOptions = {
      permitOptions: {
        permit: undefined,
      },
      tradeSpiltOptions: {
        enable: false,
        oneShotTransfer: false,
      },
    }
  ) {
    super()

    this.context = {
      plans: [],
      options: options,
    }

    for (const route of routes) {
      this.context.plans.push(buildExecutionFromRoute(route))
    }
    this.debugMode = debugMode
  }

  /** Appends one encode step; printed once at end of `encode()` as a single JSON document. */
  private debugLog(step: string, data: Record<string, unknown>): void {
    if (!this.debugMode) return
    this.debugEncodeSteps.push({ step, ...data })
  }

  encode(): void {
    if (this.debugMode) {
      this.debugEncodeSteps = []
    }
    try {
      this.encodeInner()
    } finally {
      if (this.debugMode) {
        const payload = JSON.stringify(
          { planner: 'TradePlanner.encode', steps: this.debugEncodeSteps },
          debugJsonReplacer,
          DEBUG_JSON_INDENT
        )
        console.log(payload)
      }
    }
  }

  private encodeInner(): void {
    if (this.context.plans.length === 0) {
      throw new Error('No plans to encode')
    }

    const referral = this.context.options?.referralOptions
    const isOneShotTransfer = this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false

    this.validateReferralOptions()

    if (this.context.options?.permitOptions?.permit) {
      this.addPermit(this.context.options?.permitOptions?.permit)
    }

    if (!isOneShotTransfer) {
      if (referral?.mode === 'input') {
        // Case 3: non-oneShotTransfer + input deduction
        // Per plan: transfer to router, PAY_REFERRAL, then swaps from CONTRACT_BALANCE
        for (const plan of this.context.plans) {
          if (plan.sections.length === 0) throw new Error('No sections to encode')
          if (!plan.input.isNative) {
            this.addPermit2TransferFrom(plan.input, ADDRESS_THIS, plan.amountIn)
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
        this.addPermit2TransferFrom(firstPlan.input, ADDRESS_THIS, totalAmountIn)
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

  private addPermit(permit: Permit2Signature) {
    this.debugLog('PERMIT2_PERMIT', { permit, signature: permit.signature })

    this.addCommand(CommandType.PERMIT2_PERMIT, [permit, permit.signature])
  }

  private addPermit2TransferFrom(token: Address, recipient: Address, amount: bigint) {
    const tokenHex = token.hex
    const recipientHex = recipient.hex

    this.debugLog('PERMIT2_TRANSFER_FROM', { token: tokenHex, recipient: recipientHex, amount })

    this.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [tokenHex, recipientHex, amount])
  }

  private addSweep(plan: SwapExecutionPlan) {
    const token = plan.output
    const recipient = plan.recipient ? plan.recipient : MSG_SENDER
    const amountOutMinimum = plan.minimumAmountOut

    this.debugLog('SWEEP', {
      token: { hex: token.hex, base58: token.base58, isNative: token.isNative },
      recipient: { hex: recipient.hex, base58: recipient.base58 },
      amountOutMinimum,
    })

    this.addCommand(CommandType.SWEEP, [token.hex, recipient.hex, amountOutMinimum])
  }

  private addSwap(plan: SwapExecutionPlan, section: SwapSection) {
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

  private addWTRX(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length !== 1) {
      throw new Error('WTRX pool must have exactly one pool')
    }
    const wrap = section.currencyInput.isNative

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)

    if (wrap) {
      this.debugLog('WRAP_ETH', { recipient, amountIn })
      this.addCommand(CommandType.WRAP_ETH, [recipient, amountIn])
    } else {
      this.debugLog('UNWRAP_WETH', { recipient, amountOutMinimum })
      this.addCommand(CommandType.UNWRAP_WETH, [recipient, amountOutMinimum])
    }
  }

  private addV1Swap(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V1 pool must have exactly one pool')
    }

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
    const path = encodeV1RouteToPath(section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V1_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, payerIsUser })

    this.addCommand(CommandType.V1_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, payerIsUser])

    //TODO: add V1 swap exact out
  }

  private addV2Swap(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V2 pool must have exactly one pool')
    }

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
    const path = encodeV2RouteToPath(section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V2_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, payerIsUser })

    this.addCommand(CommandType.V2_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, payerIsUser])
  }

  private addV3Swap(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('V3 pool must have exactly one pool')
    }

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
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

  private addV4Swap(plan: SwapExecutionPlan, section: SwapSection) {
    const planner = new ActionsPlanner()

    if (section.pools.length === 0) {
      throw new Error('V4 pool must have exactly one pool')
    }
    this.initV4Swap(planner, plan, section)

    if (section.pools.length === 1) {
      this.addV4SwapSingleHop(planner, plan, section)
    } else {
      this.addV4SwapMultiHop(planner, plan, section)
    }

    this.finalizeV4Swap(planner, plan, section)
  }

  private initV4Swap(planner: ActionsPlanner, plan: SwapExecutionPlan, section: SwapSection) {
    if (section.type !== RouteType.V4) {
      throw new Error('V4 swap must be a V4 pool')
    }
    const amountIn = this.getAmountIn(plan, section)
    const payerIsUser = this.getPayerIsUser(section)

    this.debugLog('V4_SETTLE', { amountIn, payerIsUser, currencyIn: section.currencyInput.hex })

    planner.add(ACTIONS.SETTLE, [section.currencyInput.hex, amountIn, payerIsUser])
  }

  private finalizeV4Swap(planner: ActionsPlanner, plan: SwapExecutionPlan, section: SwapSection) {
    if (section.type !== RouteType.V4) {
      throw new Error('V4 swap must be a V4 pool')
    }

    const recipient = this.getRecipient(plan, section).hex

    this.debugLog('V4_TAKE', { recipient })

    planner.add(ACTIONS.TAKE, [section.currencyOutput.hex, recipient, ACTION_CONSTANTS.OPEN_DELTA])

    if (section.isFirstSection) {
      planner.add(ACTIONS.TAKE, [section.currencyInput.hex, recipient, ACTION_CONSTANTS.OPEN_DELTA])
    }

    this.addCommand(CommandType.V4_SWAP, [planner.encodeActions(), planner.encodePlans()])
  }

  private addV4SwapSingleHop(planner: ActionsPlanner, plan: SwapExecutionPlan, section: SwapSection) {
    const pool = section.pools[0] as V4Pool
    if (pool.type !== PoolType.V4) {
      throw new Error('Pool must be a V4 pool')
    }

    const encodedPoolKey: EncodedPoolKey = {
      currency0: pool.currency0.hex,
      currency1: pool.currency1.hex,
      hooks: pool.hooks.hex,
      fee: pool.fee,
      parameters: this.getParameters(pool.parameters),
    }

    const swapParams: EncodedSingleSwapInParams = {
      poolKey: encodedPoolKey,
      zeroForOne: section.currencyInput.Equal(pool.currency0),
      hookData: zeroAddress,
      amountIn: ACTION_CONSTANTS.OPEN_DELTA,
      amountOutMinimum: this.getMinimumAmountOut(plan, section),
    }

    this.debugLog('V4_CL_SWAP_EXACT_IN_SINGLE', { encodedPoolKey, swapParams })

    planner.add(ACTIONS.CL_SWAP_EXACT_IN_SINGLE, [swapParams])
  }

  private addV4SwapMultiHop(planner: ActionsPlanner, plan: SwapExecutionPlan, section: SwapSection) {
    const swapParams: EncodedMultiSwapInParams = {
      amountIn: ACTION_CONSTANTS.OPEN_DELTA,
      amountOutMinimum: this.getMinimumAmountOut(plan, section),
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
          parameters: this.getParameters(pool.parameters),
        } as EncodedPathKey
      }),
    }

    this.debugLog('V4_CL_SWAP_EXACT_IN', { swapParams })

    planner.add(ACTIONS.CL_SWAP_EXACT_IN, [swapParams])
  }

  private addStableSwap(plan: SwapExecutionPlan, section: SwapSection) {
    //     'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, uint256[] flag, bool payerIsUser'
    if (section.pools.length === 0) {
      throw new Error('Stable pool must have exactly one pool')
    }
    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodeStableRouteToPathAndFlags(section)

    this.debugLog('STABLE_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.STABLE_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private addPSMSwap(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('PSM pool must have exactly one pool')
    }

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodePSMSwapToPathAndFlags(section)

    this.debugLog('PSM_SWAP_EXACT_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.PSM_SWAP_EXACT_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private addHTXSunSwap(plan: SwapExecutionPlan, section: SwapSection) {
    if (section.pools.length === 0) {
      throw new Error('HTX Sun pool must have exactly one pool')
    }

    const recipient = this.getRecipient(plan, section).hex
    const amountIn = this.getAmountIn(plan, section)
    const amountOutMinimum = this.getMinimumAmountOut(plan, section)
    const payerIsUser = this.getPayerIsUser(section)

    const { path, flags } = encodeHTXSunSwapToPathAndFlags(section)

    this.debugLog('HTX_SUN_SWAP_IN', { recipient, amountIn, amountOutMinimum, path, flags, payerIsUser })

    this.addCommand(CommandType.HTX_SUN_SWAP_IN, [recipient, amountIn, amountOutMinimum, path, flags, payerIsUser])
  }

  private getRecipient(plan: SwapExecutionPlan, section: SwapSection): Address {
    //TODO: consider postSwapOptions
    // if (section.isLastSection) {
    //   return plan.recipient ? plan.recipient : MSG_SENDER
    // } else {
    //   return ADDRESS_THIS
    // }

    return ADDRESS_THIS
  }

  private getAmountIn(plan: SwapExecutionPlan, section: SwapSection): bigint {
    // Case 3: funds already transferred to router via explicit PERMIT2_TRANSFER_FROM
    if (this.isInputReferralWithExplicitTransfer()) {
      return CONTRACT_BALANCE
    }

    if (
      section.type === RouteType.V1 ||
      section.type === RouteType.STABLE ||
      section.type === RouteType.PSM ||
      section.type === RouteType.HTX_SUN
    ) {
      if (!(this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false)) {
        if (section.isFirstSection && !section.currencyInput.isNative) {
          return plan.amountIn
        } else {
          return CONTRACT_BALANCE
        }
      } else {
        if (section.isFirstSection) {
          if (plan.spiltOptions?.isLastSpilt) {
            return CONTRACT_BALANCE
          } else {
            return plan.amountIn
          }
        } else {
          return CONTRACT_BALANCE
        }
      }
    }

    if (!(this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false)) {
      if (section.isFirstSection) {
        return plan.amountIn
      } else {
        return CONTRACT_BALANCE
      }
    } else {
      if (section.isFirstSection) {
        if (plan.spiltOptions?.isLastSpilt) {
          return CONTRACT_BALANCE
        } else {
          return plan.amountIn
        }
      } else {
        return CONTRACT_BALANCE
      }
    }
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

  private getMinimumAmountOut(plan: SwapExecutionPlan, section: SwapSection): bigint {
    // if (this.context.options?.tradeSpiltOptions?.enable ?? false) {
    //   return 0n
    // }
    // return section.isLastSection ? plan.minimumAmountOut : 0n
    return 0n
  }

  private getParameters(parameters: string | Hex): Hex {
    // if parameter not start with 0x, add 0x
    if (!parameters.startsWith('0x')) {
      parameters = '0x' + parameters
    }
    return parameters as Hex
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

  private addPayReferral(token: Currency, projectAddress: string, bps: number) {
    const project = new Address(projectAddress)
    this.debugLog('PAY_REFERRAL', { token: token.hex, project: project.hex, bps })
    this.addCommand(CommandType.PAY_REFERRAL, [token.hex, project.hex, BigInt(bps)])
  }

  private isInputReferralWithExplicitTransfer(): boolean {
    const referral = this.context.options?.referralOptions
    const isOneShotTransfer = this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false
    return !!referral && referral.mode === 'input' && !isOneShotTransfer
  }

  private validateReferralOptions() {
    const referral = this.context.options?.referralOptions
    if (!referral) return
    if (!referral.projectAddress || referral.projectAddress.length === 0) {
      throw new Error('referralOptions.projectAddress is required')
    }
    if (!Number.isInteger(referral.bps) || referral.bps < 0 || referral.bps > 10000) {
      throw new Error('referralOptions.bps must be an integer between 0 and 10000')
    }
  }
}
