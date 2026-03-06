import { Hex } from 'viem'
import { HOOKS_REGISTRATION_OFFSET } from '../constants'
import { HooksRegistration } from '../types'

export const encodeHooksRegistration = (hooksRegistration?: HooksRegistration): Hex => {
  let registration = 0x0000

  if (hooksRegistration) {
    for (const key in hooksRegistration) {
      if (hooksRegistration[key as keyof HooksRegistration]) {
        // eslint-disable-next-line no-bitwise
        registration |= 1 << HOOKS_REGISTRATION_OFFSET[key as keyof HooksRegistration]
      }
    }
  }

  return `0x${registration.toString(16).padStart(4, '0')}`
}
