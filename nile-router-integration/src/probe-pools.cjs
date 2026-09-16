#!/usr/bin/env node
const { TronWeb } = require('tronweb')
const nile = require('../config/nile.json')

const addressOutput = [{ type: 'address' }]
const v1Abi = [{ name: 'getExchange', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'token', type: 'address' }], outputs: addressOutput }]
const v2Abi = [{ name: 'getPair', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }, { name: 'b', type: 'address' }], outputs: addressOutput }]
const v3Abi = [{ name: 'getPool', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }, { name: 'b', type: 'address' }, { name: 'fee', type: 'uint24' }],
  outputs: addressOutput }]
const v3PoolAbi = [
  { name: 'liquidity', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint128' }] },
  { name: 'slot0', type: 'function', stateMutability: 'view', inputs: [], outputs: [
    { name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' },
    { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint8' }, { type: 'bool' },
  ] },
]
const quoterAbi = [
  { name: 'poolManager', type: 'function', stateMutability: 'view', inputs: [], outputs: addressOutput },
  { name: 'vault', type: 'function', stateMutability: 'view', inputs: [], outputs: addressOutput },
]
const poolManagerAbi = [{ name: 'getSlot0', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'id', type: 'bytes32' }], outputs: [
    { name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' },
    { name: 'protocolFee', type: 'uint24' }, { name: 'lpFee', type: 'uint24' },
  ] }, { name: 'getLiquidity', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ name: 'liquidity', type: 'uint128' }] }]
const stableFactoryAbi = [{ name: 'getStableInfo', type: 'function', stateMutability: 'view', inputs: [
  { name: 'input', type: 'address' }, { name: 'output', type: 'address' }, { name: 'flag', type: 'uint256' },
], outputs: [
  { name: 'k', type: 'uint256' }, { name: 'j', type: 'uint256' },
  { name: 'swapContract', type: 'address' }, { name: 'extension', type: 'uint256' },
] }]
const psmAbi = [
  { name: 'usdd', type: 'function', stateMutability: 'view', inputs: [], outputs: addressOutput },
  { name: 'gemJoin', type: 'function', stateMutability: 'view', inputs: [], outputs: addressOutput },
  { name: 'tin', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'tout', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

function normalize(tronWeb, value) {
  const raw = value.toString()
  const hex = raw.startsWith('T') ? tronWeb.address.toHex(raw) : raw.replace(/^0x/, '')
  if (/^0+$/.test(hex.replace(/^41/, ''))) return null
  return raw.startsWith('T') ? raw : tronWeb.address.fromHex(raw.startsWith('41') ? raw : `41${raw}`)
}

async function main() {
  const tronWeb = new TronWeb({ fullHost: process.env.NILE_FULL_NODE || nile.fullNode })
  tronWeb.setAddress(nile.universalRouter)
  const [v1, v2, v3, v4Quoter, v4Manager, stableFactory] = await Promise.all([
    tronWeb.contract(v1Abi, nile.v1Factory), tronWeb.contract(v2Abi, nile.v2Factory),
    tronWeb.contract(v3Abi, nile.v3Factory), tronWeb.contract(quoterAbi, nile.v4Quoter),
    tronWeb.contract(poolManagerAbi, nile.v4ClPoolManager), tronWeb.contract(stableFactoryAbi, nile.stableFactory),
  ])
  const selected = ['wtrx', 'usdt', 'usddold'].map(symbol => [symbol, nile.tokens[symbol]])
  const pools = []
  for (const [symbol, token] of selected.filter(([name]) => name !== 'wtrx')) {
    const address = normalize(tronWeb, await v1.getExchange(token).call())
    if (address) pools.push({ protocol: 'v1', tokens: ['trx', symbol], address })
  }
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
    const [aName, a] = selected[i], [bName, b] = selected[j]
    const pair = normalize(tronWeb, await v2.getPair(a, b).call())
    if (pair) pools.push({ protocol: 'v2', tokens: [aName, bName], address: pair })
    for (const fee of [100, 500, 3000, 10000]) {
      const pool = normalize(tronWeb, await v3.getPool(a, b, fee).call())
      if (pool) {
        const contract = await tronWeb.contract(v3PoolAbi, pool)
        const [liquidity, slot0] = await Promise.all([contract.liquidity().call(), contract.slot0().call()])
        pools.push({ protocol: 'v3', tokens: [aName, bName], fee, address: pool,
          liquidity: liquidity.toString(), sqrtPriceX96: slot0.sqrtPriceX96.toString(), tick: slot0.tick.toString() })
      }
    }
  }
  const configuredV4 = []
  for (const [name, pool] of Object.entries(nile.v4Pools ?? {})) {
    const [slot0, liquidity] = await Promise.all([
      v4Manager.getSlot0(pool.poolId).call(), v4Manager.getLiquidity(pool.poolId).call(),
    ])
    configuredV4.push({ name, ...pool, slot0: {
      sqrtPriceX96: slot0.sqrtPriceX96.toString(), tick: slot0.tick.toString(),
      protocolFee: slot0.protocolFee.toString(), lpFee: slot0.lpFee.toString(),
    }, liquidity: liquidity.toString() })
  }
  const v4 = {
    quoter: nile.v4Quoter,
    quoterPoolManager: normalize(tronWeb, await v4Quoter.poolManager().call()),
    quoterVault: normalize(tronWeb, await v4Quoter.vault().call()),
    routerPoolManager: nile.v4ClPoolManager,
    pools: configuredV4,
  }
  const psm = []
  for (const [name, configured] of Object.entries(nile.psmPools ?? {})) {
    for (const gem of configured.gemCandidates) {
      try {
        const info = await stableFactory.getStableInfo(configured.usdd, gem, configured.flag).call()
        const swapContract = normalize(tronWeb, info.swapContract)
        const contract = await tronWeb.contract(psmAbi, swapContract)
        const [usdd, gemJoin, tin, tout] = await Promise.all([
          contract.usdd().call(), contract.gemJoin().call(), contract.tin().call(), contract.tout().call(),
        ])
        psm.push({ name, flag: configured.flag, tokens: [configured.usdd, gem], swapContract,
          extension: info.extension.toString(), usdd: normalize(tronWeb, usdd),
          gemJoin: normalize(tronWeb, gemJoin), tin: tin.toString(), tout: tout.toString() })
      } catch (error) {
        psm.push({ name, flag: configured.flag, tokens: [configured.usdd, gem],
          error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  console.log(JSON.stringify({ network: 'nile', pools, psm, v4 }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
