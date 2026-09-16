import {
  ExactInSwapExecutionPlan,
  ExactOutSwapExecutionPlan,
  SwapExecutionOptions,
  SwapTradeRoute
} from '../types'
import { buildExecutionFromRoute } from './buildExecutionFromRoute'
import { RoutePlanner } from './RoutePlanner'

import { ExactInCompiler } from './compileExactIn'
import { ExactOutCompiler } from './compileExactOut'
import { CommandWriter } from './compiler'

const DEBUG_JSON_INDENT = 2

function debugJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

type TradeExecution = (
  | { tradeType: 'EXACT_IN'; plans: ExactInSwapExecutionPlan[] }
  | { tradeType: 'EXACT_OUT'; plan: ExactOutSwapExecutionPlan }
) & { options: SwapExecutionOptions }

export class TradePlanner extends RoutePlanner {
  private readonly execution: TradeExecution
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

    if (routes.some(route => route.tradeType === 'EXACT_OUT') &&
      (routes.length !== 1 || options.tradeSpiltOptions?.enable || options.tradeSpiltOptions?.oneShotTransfer)) {
      throw new Error('Exact-Out requires one route without split options')
    }

    this.debugMode = debugMode
    const plans: ExactInSwapExecutionPlan[] = []
    for (const route of routes) {
      const plan = buildExecutionFromRoute(route)
      if (plan.tradeType === 'EXACT_OUT') {
        this.execution = { tradeType: 'EXACT_OUT', plan, options }
        return
      }
      plans.push(plan)
    }
    this.execution = { tradeType: 'EXACT_IN', plans, options }
  }

  /** Exact-Out native budget; zero for ERC20 and legacy Exact-In plans. */
  get callValue(): bigint {
    if (this.execution.tradeType !== 'EXACT_OUT') return 0n
    const { plan } = this.execution
    return plan.input.isNative ? plan.maximumAmountIn : 0n
  }

  /** Appends one encode step; printed once at end of `encode()` as a single JSON document. */
  private debugLog(step: string, data: Record<string, unknown>): void {
    if (!this.debugMode) return
    this.debugEncodeSteps.push({ step, ...data })
  }

  encode(): void {
    const commands = this.commands
    const inputCount = this.inputs.length
    if (this.debugMode) {
      this.debugEncodeSteps = []
    }
    try {
      this.encodeInner()
    } catch (error) {
      if (this.execution.tradeType === 'EXACT_OUT') {
        this.commands = commands
        this.inputs.length = inputCount
      }
      throw error
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
    const writer: CommandWriter = {
      addCommand: this.addCommand.bind(this),
      debugLog: this.debugLog.bind(this),
    }
    const execution = this.execution
    if (execution.tradeType === 'EXACT_OUT') {
      new ExactOutCompiler(execution, writer).compile()
    } else {
      new ExactInCompiler(execution, writer).compile()
    }
  }
}
