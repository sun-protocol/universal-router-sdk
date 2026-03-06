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

export class TradePlanner extends RoutePlanner {
  private context: SwapExecutionContext
  private debugMode: boolean

  constructor(
    public routes: SwapTradeRoute[],
    debugMode: boolean = false,
    options: SwapExecutionOptions = {
      permitOptions: {
        permitEnabled: false,
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

  encode(): void {
    if (this.context.plans.length === 0) {
      throw new Error('No plans to encode')
    }

    if (this.context.options?.permitOptions?.permitEnabled && this.context.options?.permitOptions?.permit) {
      this.addPermit(this.context.options?.permitOptions?.permit)
    }
    if (!(this.context.options?.tradeSpiltOptions?.oneShotTransfer ?? false)) {
      for (const plan of this.context.plans) {
        if (plan.sections.length === 0) {
          throw new Error('No sections to encode')
        }
        for (const section of plan.sections) {
          this.addSwap(plan, section)
        }
        this.addSweep(plan)
      }
    } else {
      let totalAmountIn = 0n
      for (const plan of this.context.plans) {
        totalAmountIn += plan.amountIn
      }
      const firstPlan = this.context.plans[0]
      if (!firstPlan.input.isNative) {
        this.addPermit2TransferFrom(firstPlan.input, ADDRESS_THIS, totalAmountIn)
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
    if (this.debugMode) {
      console.log('Permit params', 'permit', permit, 'signature', permit.signature)
    }

    this.addCommand(CommandType.PERMIT2_PERMIT, [permit, permit.signature])
  }

  private addPermit2TransferFrom(token: Address, recipient: Address, amount: bigint) {
    const tokenHex = token.hex
    const recipientHex = recipient.hex

    if (this.debugMode) {
      console.log('Permit2TransferFrom params', 'token', tokenHex, 'recipient', recipientHex, 'amount', amount)
    }

    this.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [tokenHex, recipientHex, amount])
  }

  private addSweep(plan: SwapExecutionPlan) {
    const token = plan.output
    const recipient = plan.recipient ? plan.recipient : MSG_SENDER
    const amountOutMinimum = plan.minimumAmountOut

    if (this.debugMode) {
      console.log('Sweep params', 'token', token, 'recipient', recipient, 'amountOutMinimum', amountOutMinimum)
    }

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
      if (this.debugMode) {
        console.log('WTRX wrap params', 'recipient', recipient, 'amountIn', amountIn)
      }
      this.addCommand(CommandType.WRAP_ETH, [recipient, amountIn])
    } else {
      if (this.debugMode) {
        console.log('WTRX unwrap params', 'recipient', recipient, 'amountOutMinimum', amountOutMinimum)
      }
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

    if (this.debugMode) {
      console.log(
        'V1 swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'payerIsUser',
        payerIsUser
      )
    }

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

    if (this.debugMode) {
      console.log(
        'V2 swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'payerIsUser',
        payerIsUser
      )
    }

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

    if (this.debugMode) {
      console.log(
        'V3 swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'types',
        types,
        'encodedPath',
        encodedPath,
        'payerIsUser',
        payerIsUser
      )
    }

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

    if (this.debugMode) {
      console.log('V4 init swap params', 'amountIn', amountIn, 'payerIsUser', payerIsUser)
    }

    planner.add(ACTIONS.SETTLE, [section.currencyInput.hex, amountIn, payerIsUser])
  }

  private finalizeV4Swap(planner: ActionsPlanner, plan: SwapExecutionPlan, section: SwapSection) {
    if (section.type !== RouteType.V4) {
      throw new Error('V4 swap must be a V4 pool')
    }

    const recipient = this.getRecipient(plan, section).hex

    if (this.debugMode) {
      console.log('V4 finalize swap params', 'recipient', recipient)
    }

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

    if (this.debugMode) {
      console.log('V4 singlehop swap params', 'encodedPoolKey', encodedPoolKey, 'swapParams', swapParams)
    }

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

    if (this.debugMode) {
      console.log('V4 multihop swap params', 'swapParams', swapParams)
    }

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

    if (this.debugMode) {
      console.log(
        'Stable swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'flags',
        flags,
        'payerIsUser',
        payerIsUser
      )
    }

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

    if (this.debugMode) {
      console.log(
        'PSM swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'flags',
        flags,
        'payerIsUser',
        payerIsUser
      )
    }

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

    if (this.debugMode) {
      console.log(
        'HTX Sun swap params',
        'recipient',
        recipient,
        'amountIn',
        amountIn,
        'amountOutMinimum',
        amountOutMinimum,
        'path',
        path,
        'flags',
        flags,
        'payerIsUser',
        payerIsUser
      )
    }

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
    return (
      section.isFirstSection &&
      (this.context.options?.permitOptions?.permitEnabled ?? false) &&
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
}
