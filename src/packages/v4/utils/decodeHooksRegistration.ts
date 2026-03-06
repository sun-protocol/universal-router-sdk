/* eslint-disable no-bitwise */
import invariant from 'tiny-invariant'
import { Hex } from 'viem'
import { HOOKS_REGISTRATION_OFFSET } from '../constants'
import { HooksRegistration } from '../types'

export const decodeHooksRegistration = (encoded: Hex | number): HooksRegistration => {
  const registration = typeof encoded === 'number' ? encoded : parseInt(encoded, 16)

  invariant(registration >= 0 && registration <= 0x3fff, 'Invalid hooks registration')

  const hooksRegistration: Partial<HooksRegistration> = {}

  // eslint-disable-next-line guard-for-in
  for (const key in HOOKS_REGISTRATION_OFFSET) {
    if (registration & (1 << HOOKS_REGISTRATION_OFFSET[key as keyof HooksRegistration])) {
      hooksRegistration[key as keyof HooksRegistration] = true
    }
  }

  return hooksRegistration as HooksRegistration
}
