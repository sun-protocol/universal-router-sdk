import { TronWeb } from 'tronweb'
import { Hex } from 'viem'

export function toEvmHex(addr: string): Hex {
  const hex = TronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return ('0x' + body) as Hex
}

export function toBase58(addr: string): string {
  return TronWeb.address.fromHex(addr)
}
