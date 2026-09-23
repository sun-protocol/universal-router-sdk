// npm run build
// node examples/exact-out/encode.cjs quote.json [recipient] [referralProject]
// quote.json contains ONE RouteData entry, not the API's candidate array.
const fs = require('node:fs')
const { Address, TradePlanner, parseRouteAPIResponse } = require('../../dist')

const [file, recipient, projectAddress] = process.argv.slice(2)
if (!file) throw new Error('Usage: node examples/exact-out/encode.cjs quote.json [recipient] [referralProject]')
const quote = JSON.parse(fs.readFileSync(file, 'utf8'))
if (quote.tradeType !== 'EXACT_OUT') throw new Error('Expected one EXACT_OUT quote')
const route = parseRouteAPIResponse(quote, false)
if (recipient) route.recipient = new Address(recipient)
const bps = route.outputReferralBips
if (bps && !projectAddress) throw new Error('Provide the referral project from the quote request')
const planner = new TradePlanner([route], false, {
  referralOptions: bps ? { mode: 'output', bps, projectAddress } : undefined,
})
planner.encode()
if (planner.callValue > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('callValue exceeds TronWeb safe integer range')
console.log(JSON.stringify({
  commands: planner.commands,
  inputs: planner.inputs,
  callValue: Number(planner.callValue),
  // Before execution: approve Permit2 on the input token and give the Router
  // a Permit2 allowance. TRX uses callValue and needs no token approval.
  permit2Budget: route.input.isNative ? '0' : route.maximumAmountIn.toString(),
}, null, 2))
