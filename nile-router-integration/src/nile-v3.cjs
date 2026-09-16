const path = require('node:path')
const { TronWeb } = require('tronweb')
const { buildExactOutQuote } = require('./qs-exact-out.cjs')
const nile = require('../config/nile.json')

function sdk() {
  try { return require('@sun-protocol/universal-router-sdk') }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return require(path.join(__dirname, '..', '..', 'dist'))
  }
}

function candidateQuote(amountInMaximum, amountOut, fee, route = {}) {
  const tokens = route.tokens ?? [nile.tokens.trx, nile.wtrx, nile.tokens.usdt]
  const symbols = route.symbols ?? ['TRX', 'WTRX', 'USDT']
  const poolVersions = route.poolVersions ?? ['v2', 'v3']
  const poolFees = route.poolFees ?? ['0', fee]
  const hops = tokens.length - 1
  return buildExactOutQuote({
    tokens, symbols, poolVersions, poolFees,
    amountOutRaw: amountOut,
    stepAmountsInRaw: Array(hops).fill(amountInMaximum),
    stepAmountsOutRaw: [...Array(Math.max(0, hops - 1)).fill(amountInMaximum), amountOut],
    amountInMaximumRaw: amountInMaximum,
  })
}

function encodeCandidate(amountInMaximum, amountOut, fee, recipient, route) {
  const library = sdk()
  const quote = candidateQuote(amountInMaximum, amountOut, fee, route)
  const parsedRoute = library.parseRouteAPIResponse(quote, true)
  parsedRoute.recipient = new library.Address(recipient)
  const planner = new library.TradePlanner([parsedRoute], false)
  planner.encode()
  return { quote, planner }
}

async function quoteV3ExactOut(env, amountOut, fee = 500, route) {
  const endpoint = env.NILE_FULL_NODE || nile.fullNode
  const tronWeb = new TronWeb(endpoint, endpoint, endpoint, env.NILE_PRIVATE_KEY)
  const recipient = env.NILE_RECIPIENT || tronWeb.defaultAddress.base58
  if (!recipient) throw new Error('V3 Router quote search needs NILE_RECIPIENT or NILE_PRIVATE_KEY')
  const router = env.NILE_ROUTER_ADDRESS || nile.universalRouter

  async function succeeds(maximum) {
    const { planner } = encodeCandidate(maximum, amountOut, fee, recipient, route)
    try {
      const result = await tronWeb.transactionBuilder.triggerConstantContract(
        router, 'execute(bytes,bytes[],uint256)', {
          callValue: Number(planner.callValue), feeLimit: 500_000_000,
        }, [
          { type: 'bytes', value: planner.commands },
          { type: 'bytes[]', value: planner.inputs },
          { type: 'uint256', value: Math.floor(Date.now() / 1000) + 600 },
        ], tronWeb.defaultAddress.base58 || recipient)
      return Boolean(result.result?.result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/revert|REVERT opcode/i.test(message)) return false
      throw error
    }
  }

  let lower = 0n, upper = BigInt(route?.initialUpper ?? 100_000n)
  const maximumUpper = BigInt(route?.maximumUpper ?? 100_000_000n)
  while (!await succeeds(upper)) {
    lower = upper
    upper *= 2n
    if (upper > maximumUpper) throw new Error(`No executable V3 quote below ${upper} raw input units`)
  }
  while (upper - lower > 1n) {
    const middle = (lower + upper) / 2n
    if (await succeeds(middle)) upper = middle
    else lower = middle
  }
  return { amountIn: upper, fee, method: 'Universal Router constant-call boundary search' }
}

module.exports = { candidateQuote, encodeCandidate, quoteV3ExactOut }
