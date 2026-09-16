import type { Currency, Pool } from '../types'

export function nextCurrency(pool: Pool, current: Currency): Currency {
  if (current.Equal(pool.currency0)) return pool.currency1
  if (current.Equal(pool.currency1)) return pool.currency0
  throw new Error('Pool is not connected to the current currency')
}
