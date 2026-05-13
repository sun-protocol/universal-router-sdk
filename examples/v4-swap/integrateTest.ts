import { toEvmHex } from '@sun-protocol/permit2-sdk'
import { PoolVersion } from '@sun-protocol/universal-router-sdk'
import { getAddresses } from './address'
import { executeSwap, SwapParams as ExecuteSwapParams } from './swap'

type Network = 'mainnet' | 'nile'

interface AppliedReferral {
  mode: 'input' | 'output' | 'none'
  bps: number
  projectAddress?: string
}

interface TestCase {
  group: string
  name: string
  swapParams: SwapParams
  txId?: string
  picked?: boolean
  skipped?: boolean
  error?: Error
  appliedReferral?: AppliedReferral
  // Negative test: expect executeSwap to throw an Error whose message contains this substring.
  // - matched   → expectedErrorMet=true, treated as success
  // - mismatch  → error stored as a normal failure
  // - no throw  → synthetic error stored ("expected error not raised")
  expectError?: string
  expectedErrorMet?: boolean
  // Restrict the case to specific networks. Undefined ⇒ runs on all networks.
  networks?: Network[]
}

interface SwapParams {
  fromToken: string
  toToken: string
  amountIn: string
  targetPoolVersion?: PoolVersion
  typeList?: string
  maxCost?: number
  amountInReferralBps?: number
  amountOutReferralBps?: number
  referralProjectAddress?: string
  // Set true to opt out of DEFAULT_REFERRAL when no referral fields are specified.
  noReferral?: boolean
  // Per-case slippage override; falls back to the runner default when omitted.
  slippageBips?: number
}

interface ResolvedReferral {
  amountInReferralBps?: number
  amountOutReferralBps?: number
  referralProjectAddress?: string
}

// Per-network referral project address. Mainnet must be supplied via env;
// no checked-in default to avoid accidentally directing real fees to a test
// address on a production run.
const REFERRAL_PROJECT_ADDRESS_NILE = 'TNrVLZTqJ14FoFxcPHAHNJTD7taZeMK1vT'
const REFERRAL_PROJECT_ADDRESS_MAINNET = process.env.REFERRAL_PROJECT_ADDRESS_MAINNET ?? ''

// Backward-compatible export — defaults to the nile address. New code should
// use getReferralProjectAddress(network) instead.
export const REFERRAL_PROJECT_ADDRESS = REFERRAL_PROJECT_ADDRESS_NILE

export function getReferralProjectAddress(network: Network): string {
  return network === 'mainnet' ? REFERRAL_PROJECT_ADDRESS_MAINNET : REFERRAL_PROJECT_ADDRESS_NILE
}

// Default referral applied when a TestCase specifies none of the referral fields
// and noReferral is not set. Capped under the on-chain maxReferralBips (85).
// Project address is filled in per-run based on the active network.
export const DEFAULT_REFERRAL_BPS_IN = 50
export const DEFAULT_REFERRAL_BPS_OUT = 0

function buildDefaultReferral(network: Network): ResolvedReferral {
  return {
    amountInReferralBps: DEFAULT_REFERRAL_BPS_IN,
    amountOutReferralBps: DEFAULT_REFERRAL_BPS_OUT,
    referralProjectAddress: getReferralProjectAddress(network),
  }
}

// Backward-compatible default (nile values). Kept exported because the verifier
// scripts and downstream consumers may reference it; runtime code prefers the
// network-aware buildDefaultReferral().
export const DEFAULT_REFERRAL: ResolvedReferral = buildDefaultReferral('nile')

export function resolveReferral(sp: SwapParams, network: Network = 'nile'): ResolvedReferral {
  if (sp.noReferral) {
    return {}
  }
  const anySet =
    sp.amountInReferralBps !== undefined ||
    sp.amountOutReferralBps !== undefined ||
    sp.referralProjectAddress !== undefined
  if (anySet) {
    return {
      amountInReferralBps: sp.amountInReferralBps,
      amountOutReferralBps: sp.amountOutReferralBps,
      referralProjectAddress: sp.referralProjectAddress,
    }
  }
  return buildDefaultReferral(network)
}

export function computeAppliedReferral(r: ResolvedReferral): AppliedReferral {
  if (r.amountInReferralBps && r.referralProjectAddress) {
    return { mode: 'input', bps: r.amountInReferralBps, projectAddress: r.referralProjectAddress }
  }
  if (r.amountOutReferralBps && r.referralProjectAddress) {
    return { mode: 'output', bps: r.amountOutReferralBps, projectAddress: r.referralProjectAddress }
  }
  return { mode: 'none', bps: 0 }
}

export async function integrateTest() {
  const network: Network = (process.env.NETWORK as Network) || 'nile'
  if (network !== 'mainnet' && network !== 'nile') {
    throw new Error(`Unsupported NETWORK="${network}". Use "nile" or "mainnet".`)
  }
  if (network === 'mainnet' && process.env.MAINNET_CONFIRM !== 'yes') {
    throw new Error('Refusing to run on mainnet without MAINNET_CONFIRM=yes')
  }
  if (network === 'mainnet' && !REFERRAL_PROJECT_ADDRESS_MAINNET) {
    throw new Error(
      'REFERRAL_PROJECT_ADDRESS_MAINNET env var is required for mainnet runs ' +
        '(used by DEFAULT_REFERRAL fallback and any test case that does not set referralProjectAddress)'
    )
  }

  const isMainnet = network === 'mainnet'
  console.log(`🌐 Running on ${network}${isMainnet ? ' (MAINNET — real funds)' : ''}`)

  // Mainnet uses dust amounts; nile keeps the original unit-test sized amounts.
  const amountSampleDecimals3 = (isMainnet ? 1e1 : 1e3).toString()
  const amountSampleDecimals5 = (isMainnet ? 1e3 : 1e5).toString()
  const amountSampleDecimals6 = (isMainnet ? 1e3 : 1e6).toString()
  const amountSampleDecimals18 = (isMainnet ? 1e15 : 1e18).toString()

  const {
    SUN_ADDRESS,
    TRX_ADDRESS,
    USDT_ADDRESS,
    WIN_ADDRESS,
    TUSD_ADDRESS,
    USDJ_ADDRESS,
    USDDOLD_ADDRESS,
    USDC_ADDRESS,
    USDD_ADDRESS,
    USDTNEW_ADDRESS,
    THTX_ADDRESS,
    TSUN_ADDRESS,
  } = getAddresses(network)
  const REFERRAL_PROJECT_ADDRESS = getReferralProjectAddress(network)

  const V1_GROUP = 'v1 swap'
  const V2_GROUP = 'v2 swap'
  const V3_GROUP = 'v3 swap'
  const V4_GROUP = 'v4 swap'
  const STABLE_GROUP = 'stable swap'
  const PSM_GROUP = 'psm swap'
  const HTX_SUN_GROUP = 'htx sun swap'
  const MIXED_GROUP = 'mixed swap'
  const NO_REFERRAL_GROUP = 'no referral'
  const INPUT_REFERRAL_GROUP = 'input referral'
  const OUTPUT_REFERRAL_GROUP = 'output referral'
  const REFERRAL_EDGE_GROUP = 'referral edge case'

  const groupWhiteList: Record<string, boolean> = {
    [V1_GROUP]: true,
    [V2_GROUP]: true,
    [V3_GROUP]: true,
    [V4_GROUP]: true,
    [STABLE_GROUP]: true,
    [PSM_GROUP]: true,
    [HTX_SUN_GROUP]: true,
    [MIXED_GROUP]: true,
    [NO_REFERRAL_GROUP]: true,
    [INPUT_REFERRAL_GROUP]: true,
    [OUTPUT_REFERRAL_GROUP]: true,
    [REFERRAL_EDGE_GROUP]: true,
  }

  // GROUPS env override: comma-separated whitelist. Anything not listed gets disabled.
  // Example: GROUPS=v3 swap,v4 swap,no referral
  if (process.env.GROUPS) {
    const enabled = new Set(process.env.GROUPS.split(',').map(s => s.trim()))
    for (const k of Object.keys(groupWhiteList)) {
      groupWhiteList[k] = enabled.has(k)
    }
    console.log(`📋 GROUPS override active: ${[...enabled].join(', ')}`)
  }

  const testCases: TestCase[] = [
    {
      group: 'v1 swap',
      name: 'TRX->Sun',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: SUN_ADDRESS,
        amountIn: amountSampleDecimals5,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'Sun->TRX',
      swapParams: {
        fromToken: SUN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v1 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V1,
        typeList: 'SUNSWAP_V1',
        maxCost: 1,
      },
    },
    {
      group: 'v2 swap',
      name: 'TUSD->USDJ',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2',
      },
    },
    {
      group: 'v2 swap',
      name: 'USDJ->TUSD',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2',
      },
    },
    {
      group: 'v2 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2,WTRX',
      },
    },
    {
      group: 'v2 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V2,
        typeList: 'SUNSWAP_V2,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'TRX->WIN',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals3,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'WIN->TRX',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'WIN->USDT',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v3 swap',
      name: 'USDT->WIN',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals3,
        targetPoolVersion: PoolVersion.V3,
        typeList: 'SUNSWAP_V3,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'TRX->USDC',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDC->TRX',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'TRX->USDT',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'v4 swap',
      name: 'USDC->WIN',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.V4,
        typeList: 'SUNSWAP_V4,WTRX',
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDDOLD 2pool 0x3',
      networks: ['nile'],
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_2POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->USDT 2pool 0x3',
      networks: ['nile'],
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_2POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->TUSD 2pooltusdusdt 0x4',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_2POOLTUSDUSDT,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDT 2pooltusdusdt 0x4',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_2POOLTUSDUSDT,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ old3pool 0x5',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLD3POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD old3pool 0x5',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLD3POOL,
        typeList: 'CURVE',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD oldusdcpool 0x10',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ oldusdcpool 0x10',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->USDJ oldusdcpool 0x10',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDC oldusdcpool 0x10',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->TUSD oldusdcpool 0x10',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDC oldusdcpool 0x10',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_OLDUSDCPOOL,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->TUSD usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDC usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDC->USDT usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDC_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDC usdc2pooltusdusdt 0x11',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDC2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDDOLD usdd2pooltusdusdt 0x12',
      networks: ['nile'],
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->USDT usdd2pooltusdusdt 0x12',
      networks: ['nile'],
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDDOLD usdd2pooltusdusdt 0x12',
      networks: ['nile'],
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDDOLD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDDOLD->TUSD usdd2pooltusdusdt 0x12',
      networks: ['nile'],
      swapParams: {
        fromToken: USDDOLD_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDD2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->USDJ usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'TUSD->USDJ usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDJ_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->TUSD usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDJ->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDJ_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },
    {
      group: 'stable swap',
      name: 'USDT->TUSD usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TUSD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },

    {
      group: 'stable swap',
      name: 'TUSD->USDT usdj2pooltusdusdt 0x13',
      swapParams: {
        fromToken: TUSD_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.CURVE_USDJ2POOLTUSDUSDT,
        typeList: 'CURVE_COMBINATION',
        maxCost: 1,
      },
    },

    {
      group: 'psm swap',
      name: 'USDTNEW->USDD psm usdt20psm 0x1',
      networks: ['nile'],
      swapParams: {
        fromToken: USDTNEW_ADDRESS,
        toToken: USDD_ADDRESS,
        amountIn: amountSampleDecimals6,
        targetPoolVersion: PoolVersion.PSM_USDT20PSM,
        typeList: 'PSM',
        maxCost: 1,
      },
    },
    {
      group: 'htx sun swap',
      name: 'THTX->TSUN htx_sun htxsun 0x0',
      networks: ['nile'],
      swapParams: {
        fromToken: THTX_ADDRESS,
        toToken: TSUN_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.HTX_SUN,
        typeList: 'HTX_SUN',
        maxCost: 1,
      },
    },
    {
      group: 'htx sun swap',
      name: 'TSUN->THTX htx_sun htxsun 0x0',
      networks: ['nile'],
      swapParams: {
        fromToken: TSUN_ADDRESS,
        toToken: THTX_ADDRESS,
        amountIn: amountSampleDecimals18,
        targetPoolVersion: PoolVersion.HTX_SUN,
        typeList: 'HTX_SUN',
        maxCost: 1,
      },
    },
    {
      group: 'mixed swap',
      name: 'TRX->USDC',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDC_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'TRX->WIN',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: WIN_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'USDT->TRX',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },
    {
      group: 'mixed swap',
      name: 'WIN->TRX',
      swapParams: {
        fromToken: WIN_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
      },
    },

    // -------------------------------------------------------------------------
    // Referral coverage
    // -------------------------------------------------------------------------
    {
      group: 'no referral',
      name: 'USDT->TRX no referral (mixed)',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        noReferral: true,
      },
    },
    {
      group: 'no referral',
      name: 'TRX->USDT no referral (mixed)',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        noReferral: true,
      },
    },
    {
      group: 'input referral',
      name: 'USDT->TRX input 0.5%',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountInReferralBps: 50,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
    },
    {
      group: 'input referral',
      name: 'TRX->USDT input 0.5% (native in)',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountInReferralBps: 50,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
    },
    {
      group: 'output referral',
      name: 'USDT->TRX output 0.5%',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountOutReferralBps: 50,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
    },
    {
      group: 'output referral',
      name: 'TRX->USDT output 0.5% (native in)',
      swapParams: {
        fromToken: TRX_ADDRESS,
        toToken: USDT_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountOutReferralBps: 50,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
    },
    {
      group: 'referral edge case',
      name: 'USDT->TRX inBps=0 (should be ignored)',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountInReferralBps: 0,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
    },
    {
      group: 'referral edge case',
      name: 'USDT->TRX bps without project (should be ignored)',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountInReferralBps: 50,
      },
    },
    {
      group: 'referral edge case',
      name: 'router rejects both in & out bps (negative)',
      swapParams: {
        fromToken: USDT_ADDRESS,
        toToken: TRX_ADDRESS,
        amountIn: amountSampleDecimals6,
        amountInReferralBps: 30,
        amountOutReferralBps: 30,
        referralProjectAddress: REFERRAL_PROJECT_ADDRESS,
      },
      expectError: 'amountInReferralBips and amountOutReferralBips cannot both be set',
    },
  ]
  // check is there any test case has picked
  const pickedCases: TestCase[] = []
  for (const testCase of testCases) {
    if (testCase.picked) {
      pickedCases.push(testCase)
    }
  }

  const casesToRun = pickedCases.length > 0 ? pickedCases : testCases
  if (pickedCases.length > 0) {
    console.log(`📋 Running ${pickedCases.length} picked test cases`)
  }

  for (const testCase of casesToRun) {
    if (!groupWhiteList[testCase.group]) {
      console.log(`⏭️  Skipping ${testCase.name} (group: ${testCase.group} not in whitelist)`)
      testCase.skipped = true
      continue
    }
    if (testCase.networks && !testCase.networks.includes(network)) {
      console.log(`⏭️  Skipping ${testCase.name} (not enabled on ${network})`)
      testCase.skipped = true
      continue
    }
    const sp = testCase.swapParams
    const resolvedReferral = resolveReferral(sp, network)
    testCase.appliedReferral = computeAppliedReferral(resolvedReferral)
    const referralLabel =
      testCase.appliedReferral.mode === 'none'
        ? 'none'
        : `${testCase.appliedReferral.mode}/${testCase.appliedReferral.bps}bps`
    console.log(`✅ Running ${testCase.name} (group: ${testCase.group}, referral: ${referralLabel})`)

    try {
      const result = await executeSwap({
        tokenIn: sp.fromToken,
        tokenOut: sp.toToken,
        amountIn: sp.amountIn,
        network,
        slippageBips: sp.slippageBips ?? 50,
        amountInReferralBps: resolvedReferral.amountInReferralBps,
        amountOutReferralBps: resolvedReferral.amountOutReferralBps,
        referralProjectAddress: resolvedReferral.referralProjectAddress,
        typeList: sp.typeList,
        maxCost: sp.maxCost,
      } as ExecuteSwapParams)

      if (testCase.expectError) {
        const msg = `Expected error containing "${testCase.expectError}" but swap succeeded with txid ${result.txid}`
        console.error(`❌ ${msg}`)
        testCase.error = new Error(msg)
        testCase.txId = result.txid
      } else {
        testCase.txId = result.txid
      }
    } catch (error) {
      const err = error as Error
      if (testCase.expectError && err.message.includes(testCase.expectError)) {
        testCase.expectedErrorMet = true
        console.log(`✅ Expected error matched: ${err.message}`)
      } else {
        console.error(`❌ Error running ${testCase.name} (group: ${testCase.group})`, err)
        testCase.error = err
      }
    }
  }

  const fs = require('fs')
  const path = require('path')

  const testCasesFilePath = path.join(__dirname, `testCases.${network}.json`)

  fs.writeFileSync(testCasesFilePath, JSON.stringify(testCases, null, 2), 'utf-8')
  console.log(`testCases written to ${testCasesFilePath}`)
}

if (require.main === module) {
  integrateTest().catch(e => {
    console.error('Error', e)
  })
}
