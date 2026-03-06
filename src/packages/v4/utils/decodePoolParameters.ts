import { Bytes32 } from '../types'
import { decodeHooksRegistration } from './decodeHooksRegistration'
import { hexToNumber, sliceHex, trim } from 'viem'
import { PoolParameter } from '../types'
export const decodePoolParameters = (encoded: Bytes32): PoolParameter => {
  // 1. tickSpacing is int24, the range is 0x7FFFFF-0x800000
  // 2. encode will pad it to byte32 format
  // 3. so we need to slice it by sliceHex(-3)
  // 4. the last 2 byte is hooks
  // 5. so the slice should be sliceHex(-5, -2)
  const tickSpacing = hexToNumber(sliceHex(encoded, -5, -2), { signed: true })
  const hooksRegistration = decodeHooksRegistration(sliceHex(trim(encoded), -2))
  return {
    tickSpacing,
    hooksRegistration,
  }
}
