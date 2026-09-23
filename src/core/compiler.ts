import { Hex } from 'viem'
import { Address, CommandType, Currency, Permit2Signature, ReferralOptions } from '../types'
import { RoutePlanner } from './RoutePlanner'

export interface CommandWriter {
  addCommand: RoutePlanner['addCommand']
  debugLog(step: string, data: Record<string, unknown>): void
}

export function addPermit(writer: CommandWriter, permit: Permit2Signature): void {
  writer.debugLog('PERMIT2_PERMIT', { permit, signature: permit.signature })
  writer.addCommand(CommandType.PERMIT2_PERMIT, [permit, permit.signature])
}

export function addPermit2TransferFrom(
  writer: CommandWriter,
  token: Currency,
  recipient: Address,
  amount: bigint
): void {
  writer.debugLog('PERMIT2_TRANSFER_FROM', { token: token.hex, recipient: recipient.hex, amount })
  writer.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [token.hex, recipient.hex, amount])
}

export function addPayReferral(
  writer: CommandWriter,
  token: Currency,
  project: Address,
  bps: number
): void {
  writer.debugLog('PAY_REFERRAL', { token: token.hex, project: project.hex, bps })
  writer.addCommand(CommandType.PAY_REFERRAL, [token.hex, project.hex, BigInt(bps)])
}

export function addSweep(
  writer: CommandWriter,
  token: Currency,
  recipient: Address,
  amountOutMinimum: bigint
): void {
  writer.debugLog('SWEEP', {
    token: { hex: token.hex, base58: token.base58, isNative: token.isNative },
    recipient: { hex: recipient.hex, base58: recipient.base58 },
    amountOutMinimum,
  })
  writer.addCommand(CommandType.SWEEP, [token.hex, recipient.hex, amountOutMinimum])
}

export function validateReferralOptions(referral?: ReferralOptions): void {
  if (!referral) return
  if (!referral.projectAddress) throw new Error('referralOptions.projectAddress is required')
  if (!Number.isInteger(referral.bps) || referral.bps < 0 || referral.bps > 10_000) {
    throw new Error('referralOptions.bps must be an integer between 0 and 10000')
  }
}

export function normalizeParameters(parameters: string | Hex): Hex {
  return (parameters.startsWith('0x') ? parameters : `0x${parameters}`) as Hex
}
