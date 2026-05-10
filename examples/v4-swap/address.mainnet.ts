// Tron mainnet token addresses. Sourced from Tronscan / Bitquery TRC20 token registry.
//
// Empty string '' marks tokens that have no canonical mainnet equivalent
// (e.g. USDDOLD, USDTNEW are nile-only artifacts; THTX/TSUN are testnet-prefixed).
// Tests using such tokens must be filtered with `networks: ['nile']`.
export const MAINNET_ADDRESSES = {
  TRX_ADDRESS: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // native sentinel, identical on both networks
  USDT_ADDRESS: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  USDC_ADDRESS: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  USDD_ADDRESS: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
  USDJ_ADDRESS: 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT',
  TUSD_ADDRESS: 'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4',
  WTRX_ADDRESS: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
  SUN_ADDRESS: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
  WIN_ADDRESS: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
  JST_ADDRESS: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',

  // Nile-only / unmapped on mainnet — keep keys for type compatibility, but value
  // is an empty string. Tests referencing these must be marked nile-only.
  USDTNEW_ADDRESS: '',
  USDDOLD_ADDRESS: '',
  USDD2_ADDRESS: '',
  THTX_ADDRESS: '',
  TSUN_ADDRESS: '',
  SUNOLD_ADDRESS: '',
  BTC_ADDRESS: '',
  ETH_ADDRESS: '',
  DICE_ADDRESS: '',
  LIVE_ADDRESS: '',
  HT_ADDRESS: '',
} as const
