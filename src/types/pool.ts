import { Currency } from './currency'
import { Address } from './address'
import { Hex } from 'viem'

export enum PoolVersion {
  V1 = 'v1',
  V2 = 'v2',
  V3 = 'v3',
  V4 = 'v4',
  CURVE_USDD202POOL = 'usdd202pool',
  CURVE_2POOL = '2pool',
  CURVE_2POOLTUSDUSDT = '2pooltusdusdt',
  CURVE_OLD3POOL = 'old3pool',
  CURVE_OLDUSDCPOOL = 'oldusdcpool',
  CURVE_USDC2POOLTUSDUSDT = 'usdc2pooltusdusdt',
  CURVE_USDJ2POOLTUSDUSDT = 'usdj2pooltusdusdt',
  CURVE_USDD2POOLTUSDUSDT = 'usdd2pooltusdusdt',
  PSM_USDT20PSM = 'usdt20psm',
  HTX_SUN = 'htxsun',
  WTRX = 'wtrx',
}

export enum PoolType {
  V1,
  V2,
  V3,
  V4,
  STABLE,
  PSM,
  HTX_SUN,
  WTRX,
}

export enum PoolFlag {
  HTX_SUN = 0x10001,
  PSM = 0x10010,
  STABLE_USDD202POOL = 0x10100,
  STABLE_2POOL = 0x20100,
  STABLE_2POOLTUSDUSDT = 0x30100,
  STABLE_OLD3POOL = 0x40100,
  STABLE_OLDUSDCPOOL = 0x11000,
  STABLE_USDC2POOLTUSDUSDT = 0x21000,
  STABLE_USDD2POOLTUSDUSDT = 0x31000,
  STABLE_USDJ2PoolTUSDUSDT = 0x41000,
}

export interface BasePool {
  type: PoolType
  currency0: Currency
  currency1: Currency
}

export interface V1Pool extends BasePool {
  type: PoolType.V1
}

export interface V2Pool extends BasePool {
  type: PoolType.V2
}

export interface V3Pool extends BasePool {
  type: PoolType.V3
  fee: number
}

export interface V4Pool extends BasePool {
  type: PoolType.V4
  hooks: Address
  fee: number
  parameters: string | Hex
}

export interface StablePool extends BasePool {
  type: PoolType.STABLE
  flag: PoolFlag
}

export interface PSMPool extends BasePool {
  type: PoolType.PSM
  flag: PoolFlag
}

export interface HTXSunPool extends BasePool {
  type: PoolType.HTX_SUN
  flag: PoolFlag
}

export interface WTRX extends BasePool {
  type: PoolType.WTRX
}

export type Pool = V1Pool | V2Pool | V3Pool | V4Pool | StablePool | PSMPool | HTXSunPool | WTRX

export function POOL_VERSION_TO_POOL_TYPE(poolVersion: PoolVersion): PoolType {
  switch (poolVersion) {
    case PoolVersion.V1:
      return PoolType.V1
    case PoolVersion.V2:
      return PoolType.V2
    case PoolVersion.V3:
      return PoolType.V3
    case PoolVersion.V4:
      return PoolType.V4
    case PoolVersion.CURVE_2POOL:
    case PoolVersion.CURVE_USDD202POOL:
    case PoolVersion.CURVE_OLD3POOL:
    case PoolVersion.CURVE_OLDUSDCPOOL:
    case PoolVersion.CURVE_2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDC2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDD2POOLTUSDUSDT:
    case PoolVersion.CURVE_USDJ2POOLTUSDUSDT:
      return PoolType.STABLE
    case PoolVersion.PSM_USDT20PSM:
      return PoolType.PSM
    case PoolVersion.HTX_SUN:
      return PoolType.HTX_SUN
    case PoolVersion.WTRX:
      return PoolType.WTRX
  }
}

export function getPoolFlag(poolVersion: PoolVersion): PoolFlag {
  switch (poolVersion) {
    case PoolVersion.CURVE_2POOL:
      return PoolFlag.STABLE_2POOL
    case PoolVersion.CURVE_USDD202POOL:
      return PoolFlag.STABLE_USDD202POOL
    case PoolVersion.CURVE_OLD3POOL:
      return PoolFlag.STABLE_OLD3POOL
    case PoolVersion.CURVE_OLDUSDCPOOL:
      return PoolFlag.STABLE_OLDUSDCPOOL
    case PoolVersion.CURVE_2POOLTUSDUSDT:
      return PoolFlag.STABLE_2POOLTUSDUSDT
    case PoolVersion.CURVE_USDC2POOLTUSDUSDT:
      return PoolFlag.STABLE_USDC2POOLTUSDUSDT
    case PoolVersion.CURVE_USDD2POOLTUSDUSDT:
      return PoolFlag.STABLE_USDD2POOLTUSDUSDT
    case PoolVersion.CURVE_USDJ2POOLTUSDUSDT:
      return PoolFlag.STABLE_USDJ2PoolTUSDUSDT
    case PoolVersion.PSM_USDT20PSM:
      return PoolFlag.PSM
    case PoolVersion.HTX_SUN:
      return PoolFlag.HTX_SUN
    default:
      throw new Error(`Invalid pool version: ${poolVersion}`)
  }
}

export const newV1Pool = (currency0: Currency, currency1: Currency): V1Pool => {
  return {
    type: PoolType.V1,
    currency0,
    currency1,
  }
}

export const newV2Pool = (currency0: Currency, currency1: Currency): V2Pool => {
  return {
    type: PoolType.V2,
    currency0,
    currency1,
  }
}

export const newV3Pool = (currency0: Currency, currency1: Currency, fee: number): V3Pool => {
  return {
    type: PoolType.V3,
    currency0,
    currency1,
    fee,
  }
}

export const newV4Pool = (
  currency0: Currency,
  currency1: Currency,
  hooks: Address,
  fee: number,
  parameters: string
): V4Pool => {
  return {
    type: PoolType.V4,
    currency0,
    currency1,
    hooks,
    fee,
    parameters,
  }
}

export const newStablePool = (currency0: Currency, currency1: Currency, flag: PoolFlag): StablePool => {
  return {
    type: PoolType.STABLE,
    currency0,
    currency1,
    flag,
  }
}

export const newPSMPool = (currency0: Currency, currency1: Currency, flag: PoolFlag): PSMPool => {
  return {
    type: PoolType.PSM,
    currency0,
    currency1,
    flag,
  }
}

export const newHTXSunPool = (currency0: Currency, currency1: Currency, flag: PoolFlag): HTXSunPool => {
  return {
    type: PoolType.HTX_SUN,
    currency0,
    currency1,
    flag,
  }
}

export const newWTRXPool = (currency0: Currency, currency1: Currency): WTRX => {
  return {
    type: PoolType.WTRX,
    currency0,
    currency1,
  }
}
