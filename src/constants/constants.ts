import { Address } from '../types/address'
import { Currency } from '../types/currency'
import { Hex } from 'viem'

export const TRX_ADDRESS = new Currency('0x0000000000000000000000000000000000000000' as Hex, 6)
export const TESTNET_WTRX_ADDRESS = new Currency('TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a', 6)
export const MAINNET_WTRX_ADDRESS = new Currency('TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', 6)
export const MSG_SENDER = new Address('0x0000000000000000000000000000000000000001' as Hex)
export const ADDRESS_THIS = new Address('0x0000000000000000000000000000000000000002' as Hex)
export const CONTRACT_BALANCE: bigint = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')
export const ALREADY_PAID: bigint = 0n
