import { Hex } from 'viem'
import { Address } from './address'

const NATIVE_HEX = '0x0000000000000000000000000000000000000000' as Hex

export class Currency extends Address {
  public decimals?: number
  public isNative: boolean

  constructor(address: string | Hex, decimals?: number) {
    super(address)
    this.isNative = this.hex === NATIVE_HEX

    if (decimals) {
      this.decimals = decimals
    }
  }

  public Equal(currency: Currency): boolean {
    return this.base58 === currency.base58
  }
}
