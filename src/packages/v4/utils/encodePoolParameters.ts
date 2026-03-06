import { concat, encodePacked, pad } from 'viem'
import type { Bytes32, PoolParameter } from '../types'
import { encodeHooksRegistration } from './encodeHooksRegistration'

export const encodePoolParameters = (params: PoolParameter): Bytes32 => {
  const hooks = encodeHooksRegistration(params?.hooksRegistration)
  const tickSpacing = encodePacked(['int24'], [params.tickSpacing])

  return pad(concat([tickSpacing, hooks]))
}
