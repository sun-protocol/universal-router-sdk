import { maxInt16 } from 'viem'

export const MAX_TICK_SPACING = maxInt16
export const MIN_TICK_SPACING = 1n

export const MIN_BIN_STEP = 1n
export const MAX_BIN_STEP = 100n

export { ACTION_CONSTANTS, ACTIONS } from './actions'
export * from './actionsAbiParameters'
export * from './fee'
export * from './hookRegistrationOffset'
