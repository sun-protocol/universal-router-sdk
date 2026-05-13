// Tron mainnet token addresses. Sourced from Tronscan / Bitquery TRC20 token registry.
//
// Empty string '' marks tokens that have no canonical mainnet equivalent
// (e.g. USDDOLD, USDTNEW are nile-only artifacts; THTX/TSUN are testnet-prefixed).
// Tests using such tokens must be filtered with `networks: ['nile']`.
export const MAINNET_ADDRESSES = {
  TRX_ADDRESS: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // native sentinel, identical on both networks
  USDT_ADDRESS: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  USDC_ADDRESS: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  USDD_ADDRESS: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz',
  USDJ_ADDRESS: 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT',
  TUSD_ADDRESS: 'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4',
  WTRX_ADDRESS: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
  SUN_ADDRESS: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
  WIN_ADDRESS: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
  JST_ADDRESS: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',

  // Nile-only / unmapped on mainnet — keep keys for type compatibility, but value
  // is an empty string. Tests referencing these must be marked nile-only.
  USDTNEW_ADDRESS: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  USDDOLD_ADDRESS: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
  USDD2_ADDRESS: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz',
  THTX_ADDRESS: 'TUPM7K8REVzD2UdV4R5fe5M8XbnR2DdoJ6',
  TSUN_ADDRESS: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
  SUNOLD_ADDRESS: 'TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9',
  BTC_ADDRESS: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
  ETH_ADDRESS: 'THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF',
  DICE_ADDRESS: 'TKttnV3FSY1iEoAwB4N52WK2DxdV94KpSd',
  LIVE_ADDRESS: 'TVgAYofpQku5G4zenXnvxhbZxpzzrk8WVK',
  HT_ADDRESS: 'TUPM7K8REVzD2UdV4R5fe5M8XbnR2DdoJ6',
} as const
