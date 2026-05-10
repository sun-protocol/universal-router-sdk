import { TronWeb } from 'tronweb'
import * as dotenv from 'dotenv'

dotenv.config()

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

// PRIVATE_KEY_NILE preferred; fall back to PRIVATE_KEY for backward compatibility.
// PRIVATE_KEY_MAINNET has NO fallback — mainnet must be provisioned explicitly to
// avoid accidentally signing mainnet txs with a testnet key (or vice versa).
const NILE_KEY = process.env.PRIVATE_KEY_NILE ?? process.env.PRIVATE_KEY ?? ''
const MAINNET_KEY = process.env.PRIVATE_KEY_MAINNET ?? ''

export const tronWebNile = new TronWeb(
  'https://nile.trongrid.io', // fullNode
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  NILE_KEY
)

export const tronWebMainnet = new TronWeb(
  'https://api.trongrid.io', // fullNode
  'https://api.trongrid.io',
  'https://api.trongrid.io',
  MAINNET_KEY
)

// ---------------------------------------------------------------------------
// Network-level swap/router constants (Universal Router + Permit2)
// ---------------------------------------------------------------------------

export interface NetworkConstants {
  trx: string
}

export interface SwapConstants extends NetworkConstants {
  universalRouter: string
  permit2: string
  routerApiUrl: string
  clQuoter: string
}

export const MAINNET: SwapConstants = {
  universalRouter: 'TSJEtPuqHpvSaVnSwvCsngaeBxrGUzp95Q',
  permit2: 'TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9',
  routerApiUrl: 'https://rot.endjgfsv.link',
  trx: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
  clQuoter: 'TSupQTJWWoVpUqA7KGVYb8dB97n3civwiJ',
}

export const NILE: SwapConstants = {
  universalRouter: 'TLmHD2TJoGVEMkGiE1JzSwd6CEPa8jXumJ',
  permit2: 'TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h',
  routerApiUrl: 'https://tnrouter.endjgfsv.link',
  trx: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
  clQuoter: 'TWbsXKMjoDPjW4kjqv4qs5gbesnJ8wKref',
}

export function getSwapConstants(network: string): SwapConstants {
  if (network === 'mainnet') {
    return MAINNET
  } else if (network === 'nile') {
    return NILE
  } else {
    throw new Error(`Swap is not supported on network "${network}". Supported: mainnet, nile`)
  }
}

export function toEvmHex(addr: string): string {
  const hex = TronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body
}

export function toBase58(addr: string): string {
  return TronWeb.address.fromHex(addr)
}

/**
 * Parse TronWeb constant_result based on ABI output definition
 * @param hexResult - The hex string from constant_result[0]
 * @param outputs - Array of ABI output definitions with optional components for tuples
 * @returns Parsed object with named properties
 */
export function parseConstantResult(
  hexResult: string,
  outputs: Array<{
    name: string
    type: string
    components?: Array<{ name: string; type: string }>
  }>
): Record<string, any> {
  // Remove 0x prefix if present
  const cleanHex = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult

  const result: Record<string, any> = {}
  let offset = 0

  for (const output of outputs) {
    if (output.type === 'tuple' && output.components) {
      // Handle tuple (struct) types
      const tupleResult: Record<string, any> = {}

      for (const component of output.components) {
        const hexValue = cleanHex.slice(offset, offset + 64)

        if (component.type === 'address') {
          // Address takes 20 bytes, but padded to 32 bytes (last 40 hex chars)
          const addressHex = hexValue.slice(24) // Skip 24 hex chars (12 bytes) of padding
          tupleResult[component.name] = '0x' + addressHex
        } else if (component.type.startsWith('int')) {
          // Handle signed integers (int24, int256, etc.)
          const bitLength = parseInt(component.type.replace('int', '')) || 256

          // For types smaller than 256 bits, extract only the relevant bits from the right
          let relevantHex: string
          if (bitLength < 256) {
            const hexChars = Math.ceil(bitLength / 4) // 4 bits per hex char
            relevantHex = hexValue.slice(-hexChars) // Take from the right
          } else {
            relevantHex = hexValue
          }

          let value = BigInt('0x' + relevantHex)
          const signBit = BigInt(2) ** BigInt(bitLength - 1)

          // Check if it's negative (two's complement)
          if (value >= signBit) {
            value = value - BigInt(2) ** BigInt(bitLength)
          }

          tupleResult[component.name] = value
        } else if (component.type.startsWith('uint')) {
          // Handle all unsigned integers (uint24, uint160, uint256, etc.)
          tupleResult[component.name] = BigInt('0x' + hexValue)
        } else if (component.type === 'bytes32') {
          tupleResult[component.name] = '0x' + hexValue
        } else {
          throw new Error(`Unsupported component type: ${component.type}`)
        }

        offset += 64
      }

      result[output.name] = tupleResult
    } else {
      // Handle simple types
      const hexValue = cleanHex.slice(offset, offset + 64)

      if (output.type === 'address') {
        // Address takes 20 bytes, but padded to 32 bytes (last 40 hex chars)
        const addressHex = hexValue.slice(24) // Skip 24 hex chars (12 bytes) of padding
        result[output.name] = '0x' + addressHex
      } else if (output.type.startsWith('int')) {
        // Handle signed integers (int24, int256, etc.)
        const bitLength = parseInt(output.type.replace('int', '')) || 256

        // For types smaller than 256 bits, extract only the relevant bits from the right
        let relevantHex: string
        if (bitLength < 256) {
          const hexChars = Math.ceil(bitLength / 4) // 4 bits per hex char
          relevantHex = hexValue.slice(-hexChars) // Take from the right
        } else {
          relevantHex = hexValue
        }

        let value = BigInt('0x' + relevantHex)
        const signBit = BigInt(2) ** BigInt(bitLength - 1)

        // Check if it's negative (two's complement)
        if (value >= signBit) {
          value = value - BigInt(2) ** BigInt(bitLength)
        }

        result[output.name] = value
      } else if (output.type.startsWith('uint')) {
        // Handle all unsigned integers (uint24, uint160, uint256, etc.)
        result[output.name] = BigInt('0x' + hexValue)
      } else if (output.type === 'bytes32') {
        result[output.name] = '0x' + hexValue
      } else {
        throw new Error(`Unsupported type: ${output.type}`)
      }

      offset += 64
    }
  }

  return result
}
