import { toBase58, toEvmHex } from '../utils/addressConvert'
import { Hex } from 'viem'

export class Address {
  public base58: string
  public hex: Hex

  constructor(address: string | Hex) {
    if (Address.isHex(address)) {
      this.hex = address
      this.base58 = toBase58(this.hex)
    } else {
      this.base58 = address
      this.hex = toEvmHex(this.base58) as Hex
    }
  }

  public Equal(address: Address): boolean {
    return this.base58 === address.base58
  }
  /**
   * Utility method to check if the input is a Hex type.
   * In practice, Hex is an alias for string, but you can distinguish by format.
   * EVM hex address usually starts with '0x' and is 42 characters long.
   */
  public static isHex(address: string | Hex): address is Hex {
    return typeof address === 'string' && address.startsWith('0x')
  }
}
