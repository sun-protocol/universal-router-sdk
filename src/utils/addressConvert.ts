import { Hex, sha256 } from 'viem'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const TRON_PREFIX = 0x41

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0')
  }
  return hex
}

function doubleSha256(data: Uint8Array): Uint8Array {
  const first = sha256(('0x' + bytesToHex(data)) as Hex)
  const second = sha256(first as Hex)
  return hexToBytes(second)
}

function base58Encode(bytes: Uint8Array): string {
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }

  let result = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result += BASE58_ALPHABET[0]
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]]
  }
  return result
}

function base58Decode(str: string): Uint8Array {
  const bytes = [0]
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char)
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`)
    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  let leadingZeros = 0
  for (const char of str) {
    if (char !== BASE58_ALPHABET[0]) break
    leadingZeros++
  }

  const result = new Uint8Array(leadingZeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[bytes.length - 1 - i]
  }
  return result
}

/**
 * Convert a TRON base58check address to an EVM-compatible 0x-prefixed hex address.
 * e.g. "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7" → "0x..."
 */
export function toEvmHex(addr: string): Hex {
  const decoded = base58Decode(addr)
  // decoded = [0x41, ...20 address bytes, ...4 checksum bytes]
  const addressBytes = decoded.slice(1, 21)
  return ('0x' + bytesToHex(addressBytes)) as Hex
}

/**
 * Convert a hex address to a TRON base58check address.
 * Accepts "0x..." (20 bytes) or "41..." (21 bytes with TRON prefix).
 */
export function toBase58(addr: string): string {
  let bodyHex: string
  if (addr.startsWith('0x')) {
    bodyHex = '41' + addr.slice(2)
  } else if (addr.startsWith('41') && addr.length === 42) {
    bodyHex = addr
  } else {
    bodyHex = '41' + addr
  }

  const payload = hexToBytes(bodyHex)
  if (payload[0] !== TRON_PREFIX) {
    throw new Error(`Invalid TRON address prefix: expected 0x41, got 0x${payload[0].toString(16)}`)
  }

  const hash = doubleSha256(payload)
  const checksum = hash.slice(0, 4)

  const full = new Uint8Array(payload.length + 4)
  full.set(payload)
  full.set(checksum, payload.length)

  return base58Encode(full)
}
