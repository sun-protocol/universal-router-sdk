const path = require('node:path')

function loadSdk() {
  // Prefer an installed dependency; fall back to the adjacent SDK build for local development.
  try {
    return require('@sun-protocol/universal-router-sdk')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return require(path.join(__dirname, '..', '..', 'dist'))
  }
}

async function encodeScenario(scenario, env) {
  const sdk = loadSdk()
  const quote = await scenario.buildQuote(env)
  if (scenario.encode) return { quote, ...await scenario.encode({ sdk, quote, env }) }
  const route = sdk.parseRouteAPIResponse(quote, true)
  const recipient = scenario.recipient(env)
  if (!recipient) throw new Error(`Scenario ${scenario.id ?? '<unnamed>'} requires a recipient`)
  route.recipient = new sdk.Address(recipient)
  const referralRecipient = quote.amountOutReferralBips ? scenario.referralRecipient?.(env) : undefined
  if (quote.amountOutReferralBips && !referralRecipient) {
    throw new Error(`Scenario ${scenario.id ?? '<unnamed>'} requires an output referral recipient`)
  }
  const referralOptions = quote.amountOutReferralBips
    ? { mode: 'output', bps: quote.amountOutReferralBips, projectAddress: referralRecipient }
    : undefined
  const planner = new sdk.TradePlanner([route], false, { referralOptions })
  planner.encode()
  const callValue = scenario.callValue ? BigInt(await scenario.callValue({ quote, route, env })) : planner.callValue
  return { quote, route, planner, callValue, recipient, referralRecipient }
}

module.exports = { loadSdk, encodeScenario }
