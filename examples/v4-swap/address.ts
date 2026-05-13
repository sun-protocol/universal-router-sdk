// Address router. New code should use `getAddresses(network)`. The flat exports
// at the bottom remain for backward compatibility (nile values, identical to
// pre-split behavior).
import { NILE_ADDRESSES } from './address.nile'
import { MAINNET_ADDRESSES } from './address.mainnet'

export type AddressMap = { readonly [K in keyof typeof NILE_ADDRESSES]: string }

export function getAddresses(network: string): AddressMap {
  if (network === 'mainnet') return MAINNET_ADDRESSES
  if (network === 'nile') return NILE_ADDRESSES
  throw new Error(`Unsupported network: ${network}`)
}

// Backward-compatible flat exports — nile values.
// Deprecated for new code; prefer `getAddresses(network)` so the testCases stay
// network-agnostic.
export const TRX_ADDRESS = NILE_ADDRESSES.TRX_ADDRESS
export const USDT_ADDRESS = NILE_ADDRESSES.USDT_ADDRESS
export const USDC_ADDRESS = NILE_ADDRESSES.USDC_ADDRESS
export const USDTNEW_ADDRESS = NILE_ADDRESSES.USDTNEW_ADDRESS
export const TUSD_ADDRESS = NILE_ADDRESSES.TUSD_ADDRESS
export const USDDOLD_ADDRESS = NILE_ADDRESSES.USDDOLD_ADDRESS
export const USDD_ADDRESS = NILE_ADDRESSES.USDD_ADDRESS
export const USDJ_ADDRESS = NILE_ADDRESSES.USDJ_ADDRESS
export const WTRX_ADDRESS = NILE_ADDRESSES.WTRX_ADDRESS
export const SUN_ADDRESS = NILE_ADDRESSES.SUN_ADDRESS
export const SUNOLD_ADDRESS = NILE_ADDRESSES.SUNOLD_ADDRESS
export const BTC_ADDRESS = NILE_ADDRESSES.BTC_ADDRESS
export const ETH_ADDRESS = NILE_ADDRESSES.ETH_ADDRESS
export const JST_ADDRESS = NILE_ADDRESSES.JST_ADDRESS
export const WIN_ADDRESS = NILE_ADDRESSES.WIN_ADDRESS
export const DICE_ADDRESS = NILE_ADDRESSES.DICE_ADDRESS
export const LIVE_ADDRESS = NILE_ADDRESSES.LIVE_ADDRESS
export const HT_ADDRESS = NILE_ADDRESSES.HT_ADDRESS
export const USDD2_ADDRESS = NILE_ADDRESSES.USDD2_ADDRESS
export const THTX_ADDRESS = NILE_ADDRESSES.THTX_ADDRESS
export const TSUN_ADDRESS = NILE_ADDRESSES.TSUN_ADDRESS
