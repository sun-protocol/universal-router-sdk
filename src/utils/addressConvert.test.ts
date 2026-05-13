import { describe, it, expect } from 'vitest'
import { toEvmHex, toBase58 } from './addressConvert'

// Ground-truth vectors generated from TronWeb v6
const VECTORS = [
  {
    base58: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    evmHex: '0x0000000000000000000000000000000000000000',
  },
  {
    base58: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    evmHex: '0x74472e7d35395a6b5add427eecb7f4b62ad2b071',
  },
  {
    base58: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
    evmHex: '0xc9004f0a5bb2c6b15b10a0628c99d7fdeaf7bf60',
  },
  {
    base58: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on mainnet
    evmHex: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c',
  },
  {
    base58: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
    evmHex: '0xea51342dabbb928ae1e576bd39eff8aaf070a8c6',
  },
]

describe('toEvmHex', () => {
  for (const v of VECTORS) {
    it(`${v.base58} → ${v.evmHex}`, () => {
      expect(toEvmHex(v.base58)).toBe(v.evmHex)
    })
  }
})

describe('toBase58', () => {
  for (const v of VECTORS) {
    it(`${v.evmHex} → ${v.base58}`, () => {
      expect(toBase58(v.evmHex)).toBe(v.base58)
    })
  }

  it('accepts 41-prefixed hex without 0x', () => {
    expect(toBase58('41a614f803b6fd780986a42c78ec9c7f77e6ded13c')).toBe(
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    )
  })
})

describe('roundtrip', () => {
  for (const v of VECTORS) {
    it(`base58 → hex → base58: ${v.base58}`, () => {
      expect(toBase58(toEvmHex(v.base58))).toBe(v.base58)
    })

    it(`hex → base58 → hex: ${v.evmHex}`, () => {
      expect(toEvmHex(toBase58(v.evmHex))).toBe(v.evmHex)
    })
  }
})
