// Called by Foundry FFI: use the SDK itself to produce the Router inputs.
const { parseRouteAPIResponse, TradePlanner, Address } = require('../../dist')
const { encodeAbiParameters, parseAbiParameters } = require('viem')
const [tokensArg, parameters, recipient, maximum = '2000000000000000000', protocol = 'v4',
  target = '1000000000000000000', inputBips = '0', outputBips = '0', routingInput = '1000000000000000000'] = process.argv.slice(2)
const tokens = tokensArg.toLowerCase().split(',')
const n = tokens.length - 1
const native = '0x0000000000000000000000000000000000000000'
const wrapped = '0x891cdb91d149f23b1a45d9c5ca78a88d0cb44c18'
const versions = tokens.slice(1).map((token, i) =>
  tokens[i] === native && token === wrapped || tokens[i] === wrapped && token === native ? 'wtrx' : protocol)
const grossForNet = (n, bps) => (n - 1n) * 10000n / (10000n - BigInt(bps)) + 1n
const gross = grossForNet(BigInt(target), outputBips)
const total = grossForNet(BigInt(routingInput), inputBips)
const feeBase = tokens[0] === '0x0000000000000000000000000000000000000000' ? BigInt(maximum) : total
const inputFee = feeBase * BigInt(inputBips) / 10000n
const route = parseRouteAPIResponse({
  // Match QS wire format: wrapping is labelled v2; poolFees has a trailing display item.
  tradeType: 'EXACT_OUT', tokens, poolVersions: versions.map(version => version === 'wtrx' ? 'v2' : version),
  poolFees: [...versions.map(version => version === 'wtrx' ? '0' : '3000'), '0'],
  poolKeys: tokens.slice(1).map((token, i) => versions[i] !== 'v4' ? null : ({
    token0: [tokens[i], token].sort()[0], token1: [tokens[i], token].sort()[1],
    hooks: '0x0000000000000000000000000000000000000000', fee: 3000, parameters,
  })),
  amountInRaw: (BigInt(routingInput) + inputFee).toString(), amountOutRaw: target,
  amountInMaximumRaw: maximum, amountInRawReferral: inputFee.toString(),
  amountOutRawReferral: (gross * BigInt(outputBips) / 10000n).toString(),
  amountInReferralBips: Number(inputBips), amountOutReferralBips: Number(outputBips),
  stepAmountsInRaw: [routingInput, ...Array(n - 1).fill(gross.toString())],
  stepAmountsOutRaw: Array(n).fill(gross.toString()),
}, false)
route.recipient = new Address(recipient)
const referralOptions = Number(inputBips) ? { mode: 'input', bps: Number(inputBips), projectAddress: recipient }
  : Number(outputBips) ? { mode: 'output', bps: Number(outputBips), projectAddress: recipient } : undefined
const planner = new TradePlanner([route], false, { referralOptions })
planner.encode()
process.stdout.write(encodeAbiParameters(parseAbiParameters('bytes,bytes[],uint256'),
  [planner.commands, planner.inputs, planner.callValue]))
