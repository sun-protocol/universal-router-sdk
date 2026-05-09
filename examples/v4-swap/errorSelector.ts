import { keccak256, toUtf8Bytes } from 'ethers'

interface AbiError {
  name: string
  type: 'Error'
  inputs?: Array<{
    name: string
    type: string
  }>
}

interface AbiItem {
  name?: string
  type: string
  stateMutability?: string
  inputs?: Array<{
    indexed?: boolean
    name?: string
    type: string
  }>
  outputs?: Array<{
    name?: string
    type: string
    components?: []
  }>
}

interface TronGridTransactionInfo {
  contractResult?: string[]
  id?: string
  contract_address?: string
  result?: string
  resMessage?: string
}

/**
 * Generate error signature from error ABI
 * @param errorAbi - The error ABI item
 * @returns The error signature string (e.g., "CurrencyNotSettled()")
 */
function getErrorSignature(errorAbi: AbiError): string {
  const name = errorAbi.name
  const inputs = errorAbi.inputs || []

  // Build parameter types string
  const paramTypes = inputs.map(input => input.type).join(',')

  return `${name}(${paramTypes})`
}

/**
 * Calculate error selector (first 4 bytes of keccak256 hash)
 * @param signature - The error signature string
 * @returns The error selector in hex format (8 characters without 0x)
 */
function calculateErrorSelector(signature: string): string {
  const hash = keccak256(toUtf8Bytes(signature))
  // Return first 4 bytes (8 hex characters) without '0x' prefix
  return hash.slice(2, 10)
}

/**
 * Process ABI and generate error selectors for all errors
 * @param abi - The contract ABI array
 * @param contractName - Optional contract name for identification
 * @returns Map of error names to their selectors and signatures
 */
export function generateErrorSelectors(
  abi: AbiItem[],
  contractName?: string
): Map<string, { selector: string; signature: string; contract?: string }> {
  const errorMap = new Map<string, { selector: string; signature: string; contract?: string }>()

  // Filter only error types
  const errors = abi.filter(item => item.type === 'Error') as AbiError[]

  for (const error of errors) {
    const signature = getErrorSignature(error)
    const selector = calculateErrorSelector(signature)

    errorMap.set(error.name, {
      selector,
      signature,
      contract: contractName,
    })
  }

  return errorMap
}

/**
 * Verify a specific error selector
 * @param errorName - The error name
 * @param expectedSelector - The expected selector (with or without 0x prefix)
 * @param abi - The contract ABI array
 * @returns Whether the selector matches
 */
export function verifyErrorSelector(errorName: string, expectedSelector: string, abi: AbiItem[]): boolean {
  const errorMap = generateErrorSelectors(abi)
  const errorInfo = errorMap.get(errorName)

  if (!errorInfo) {
    console.log(`Error "${errorName}" not found in ABI`)
    return false
  }

  // Remove 0x prefix if present
  const cleanExpected = expectedSelector.startsWith('0x') ? expectedSelector.slice(2) : expectedSelector

  const matches = errorInfo.selector.toLowerCase() === cleanExpected.toLowerCase()

  console.log(`\nVerifying ${errorName}:`)
  console.log(`  Signature: ${errorInfo.signature}`)
  console.log(`  Calculated: 0x${errorInfo.selector}`)
  console.log(`  Expected:   0x${cleanExpected}`)
  console.log(`  Match:      ${matches ? '✓' : '✗'}`)

  return matches
}

/**
 * Get error selector for a simple error signature string
 * @param signature - Error signature (e.g., "CurrencyNotSettled()")
 * @returns The error selector in hex format (8 characters without 0x)
 */
export function getErrorSelector(signature: string): string {
  return calculateErrorSelector(signature)
}

/**
 * Find error by selector (reverse lookup) - supports multiple ABIs
 * @param selector - The error selector (with or without 0x prefix)
 * @param abis - The contract ABI array or array of ABIs with contract names
 * @returns The matching error info or null if not found
 */
export function findErrorBySelector(
  selector: string,
  abis: AbiItem[] | Array<{ abi: AbiItem[]; contract: string }>
): { name: string; signature: string; selector: string; contract?: string } | null {
  // Remove 0x prefix if present
  const cleanSelector = selector.startsWith('0x') ? selector.slice(2) : selector

  // Handle both single ABI and multiple ABIs
  const abiList =
    Array.isArray(abis) && abis.length > 0 && 'abi' in abis[0]
      ? (abis as Array<{ abi: AbiItem[]; contract: string }>)
      : [{ abi: abis as AbiItem[], contract: undefined }]

  for (const { abi, contract } of abiList) {
    const errorMap = generateErrorSelectors(abi, contract)

    for (const [name, { selector: errorSelector, signature, contract: contractName }] of errorMap.entries()) {
      if (errorSelector.toLowerCase() === cleanSelector.toLowerCase()) {
        return {
          name,
          signature,
          selector: errorSelector,
          contract: contractName,
        }
      }
    }
  }

  return null
}

/**
 * Parse contract revert data
 * @param revertData - The full revert data from contract (with or without 0x prefix)
 * @param abis - The contract ABI array or array of ABIs with contract names
 * @returns Parsed error information
 */
export function parseRevertData(revertData: string, abis: AbiItem[] | Array<{ abi: AbiItem[]; contract: string }>) {
  // Remove 0x prefix if present
  const cleanData = revertData.startsWith('0x') ? revertData.slice(2) : revertData

  if (cleanData.length < 8) {
    return {
      found: false,
      selector: cleanData,
      rawData: cleanData,
    }
  }

  // First 8 chars (4 bytes) is the error selector
  const selector = cleanData.slice(0, 8)
  // Rest is the parameter data
  const paramData = cleanData.slice(8)

  // Find the error
  const errorInfo = findErrorBySelector(selector, abis)

  if (!errorInfo) {
    return {
      found: false,
      selector: `0x${selector}`,
      paramData: paramData ? `0x${paramData}` : undefined,
      rawData: cleanData,
    }
  }

  // Parse parameters (simple parsing for common types)
  const params = parseErrorParams(paramData, errorInfo.signature)

  return {
    found: true,
    selector: `0x${selector}`,
    errorName: errorInfo.name,
    signature: errorInfo.signature,
    contract: errorInfo.contract,
    paramData: paramData ? `0x${paramData}` : undefined,
    parsedParams: params,
    rawData: cleanData,
  }
}

/**
 * Simple parameter parser for common types
 */
function parseErrorParams(paramData: string, signature: string) {
  if (!paramData) return []

  // Extract parameter types from signature
  const match = signature.match(/\(([^)]*)\)/)
  if (!match || !match[1]) return []

  const paramTypes = match[1].split(',').map(t => t.trim())
  const params: Array<{ type: string; value: string; decoded?: string | number | boolean }> = []

  let offset = 0
  for (const type of paramTypes) {
    const chunk = paramData.slice(offset, offset + 64)
    if (!chunk) break

    let decoded: string | number | boolean | undefined

    // Simple decoding for common types
    if (type.startsWith('uint') || type.startsWith('int')) {
      // Parse as number
      decoded = parseInt(chunk, 16)
    } else if (type === 'address') {
      // Last 40 chars (20 bytes) is the address
      decoded = '0x' + chunk.slice(-40)
    } else if (type === 'bool') {
      decoded = parseInt(chunk, 16) === 1
    }

    params.push({
      type,
      value: `0x${chunk}`,
      decoded,
    })

    offset += 64
  }

  return params
}

// UniversalRouter ABI
const universalRouterAbi: AbiItem[] = [
  { inputs: [{ name: 'params', type: 'tuple' }], stateMutability: 'Nonpayable', type: 'Constructor' },
  { name: 'BalanceTooLow', type: 'Error' },
  { name: 'ContractLocked', type: 'Error' },
  { inputs: [{ name: 'currency', type: 'address' }], name: 'DeltaNotNegative', type: 'Error' },
  { inputs: [{ name: 'currency', type: 'address' }], name: 'DeltaNotPositive', type: 'Error' },
  { name: 'ETHNotAccepted', type: 'Error' },
  { name: 'EnforcedPause', type: 'Error' },
  {
    inputs: [
      { name: 'commandIndex', type: 'uint256' },
      { name: 'message', type: 'bytes' },
    ],
    name: 'ExecutionFailed',
    type: 'Error',
  },
  { name: 'ExpectedPause', type: 'Error' },
  { name: 'FromAddressIsNotOwner', type: 'Error' },
  { name: 'HtxSunInvalidPath', type: 'Error' },
  { name: 'HtxSunTooLittleReceived', type: 'Error' },
  { name: 'HtxSunTooMuchRequested', type: 'Error' },
  { name: 'InputLengthMismatch', type: 'Error' },
  { name: 'InsufficientBalance', type: 'Error' },
  { name: 'InsufficientETH', type: 'Error' },
  { name: 'InsufficientToken', type: 'Error' },
  { inputs: [{ name: 'action', type: 'bytes4' }], name: 'InvalidAction', type: 'Error' },
  { name: 'InvalidBips', type: 'Error' },
  { inputs: [{ name: 'commandType', type: 'uint256' }], name: 'InvalidCommandType', type: 'Error' },
  { name: 'InvalidEthSender', type: 'Error' },
  { name: 'InvalidPath', type: 'Error' },
  { inputs: [{ name: 'recipient', type: 'address' }], name: 'InvalidRecipient', type: 'Error' },
  { name: 'InvalidReserves', type: 'Error' },
  { name: 'InvalidSafeVault', type: 'Error' },
  { name: 'LengthMismatch', type: 'Error' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'NotAuthorizedForToken', type: 'Error' },
  { name: 'NotVault', type: 'Error' },
  { name: 'OnlyAddLiqudityAllowed', type: 'Error' },
  { name: 'OnlyMintAllowed', type: 'Error' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'OwnableInvalidOwner', type: 'Error' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'OwnableUnauthorizedAccount', type: 'Error' },
  { name: 'PSMInvalidExchange', type: 'Error' },
  { name: 'PSMInvalidPath', type: 'Error' },
  { name: 'PSMTooLittleReceived', type: 'Error' },
  { name: 'PSMTooMuchRequested', type: 'Error' },
  { name: 'RecipientErr', type: 'Error' },
  { name: 'SafeCastOverflow', type: 'Error' },
  { name: 'SliceOutOfBounds', type: 'Error' },
  { name: 'StableInvalidPath', type: 'Error' },
  { name: 'StableTooLittleReceived', type: 'Error' },
  { name: 'StableTooMuchRequested', type: 'Error' },
  {
    inputs: [
      { name: 'minAmountOutReceived', type: 'uint256' },
      { name: 'amountReceived', type: 'uint256' },
    ],
    name: 'TooLittleReceived',
    type: 'Error',
  },
  {
    inputs: [
      { name: 'maxAmountInRequested', type: 'uint256' },
      { name: 'amountRequested', type: 'uint256' },
    ],
    name: 'TooMuchRequested',
    type: 'Error',
  },
  { name: 'TransactionDeadlinePassed', type: 'Error' },
  { name: 'UnsafeCast', type: 'Error' },
  { inputs: [{ name: 'action', type: 'uint256' }], name: 'UnsupportedAction', type: 'Error' },
  { name: 'V1InvalidExchange', type: 'Error' },
  { name: 'V1InvalidPath', type: 'Error' },
  { name: 'V1TooLittleReceived', type: 'Error' },
  { name: 'V1TooMuchRequested', type: 'Error' },
  { name: 'V2InvalidPath', type: 'Error' },
  { name: 'V2TooLittleReceived', type: 'Error' },
  { name: 'V2TooMuchRequested', type: 'Error' },
  { name: 'V3InvalidAmountOut', type: 'Error' },
  { name: 'V3InvalidCaller', type: 'Error' },
  { name: 'V3InvalidSwap', type: 'Error' },
  { name: 'V3TooLittleReceived', type: 'Error' },
  { name: 'V3TooMuchRequested', type: 'Error' },
]

// PoolManager ABI
const poolManagerAbi: AbiItem[] = [
  { stateMutability: 'Nonpayable', type: 'Constructor' },
  { name: 'AppUnregistered', type: 'Error' },
  { name: 'CannotUpdateEmptyPosition', type: 'Error' },
  {
    inputs: [
      { name: 'currency0', type: 'address' },
      { name: 'currency1', type: 'address' },
    ],
    name: 'CurrenciesInitializedOutOfOrder',
    type: 'Error',
  },
  { name: 'CurrencyNotSettled', type: 'Error' },
  { name: 'DelegateCallNotAllowed', type: 'Error' },
  { name: 'EnforcedPause', type: 'Error' },
  { name: 'FeeCurrencySynced', type: 'Error' },
  { name: 'HookConfigValidationError', type: 'Error' },
  { name: 'HookDeltaExceedsSwapAmount', type: 'Error' },
  { name: 'HookPermissionsValidationError', type: 'Error' },
  { name: 'InvalidCaller', type: 'Error' },
  { name: 'InvalidFeeForExactOut', type: 'Error' },
  { name: 'InvalidHookResponse', type: 'Error' },
  {
    inputs: [
      { name: 'sqrtPriceCurrentX96', type: 'uint160' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'InvalidSqrtPriceLimit',
    type: 'Error',
  },
  { inputs: [{ name: 'sqrtPriceX96', type: 'uint160' }], name: 'InvalidSqrtRatio', type: 'Error' },
  { inputs: [{ name: 'tick', type: 'int24' }], name: 'InvalidTick', type: 'Error' },
  { inputs: [{ name: 'fee', type: 'uint24' }], name: 'LPFeeTooLarge', type: 'Error' },
  { inputs: [{ name: 'locker', type: 'address' }], name: 'LockerAlreadySet', type: 'Error' },
  { name: 'MustClearExactPositiveDelta', type: 'Error' },
  { name: 'NoLiquidityToReceiveFees', type: 'Error' },
  { name: 'NoLocker', type: 'Error' },
  { name: 'PoolAlreadyInitialized', type: 'Error' },
  { name: 'PoolManagerMismatch', type: 'Error' },
  { name: 'PoolNotInitialized', type: 'Error' },
  { name: 'PoolPaused', type: 'Error' },
  { name: 'ProtocolFeeCannotBeFetched', type: 'Error' },
  { inputs: [{ name: 'fee', type: 'uint24' }], name: 'ProtocolFeeTooLarge', type: 'Error' },
  { name: 'SettleNonNativeCurrencyWithValue', type: 'Error' },
  { name: 'SwapAmountCannotBeZero', type: 'Error' },
  { inputs: [{ name: 'tick', type: 'int24' }], name: 'TickLiquidityOverflow', type: 'Error' },
  { inputs: [{ name: 'tickLower', type: 'int24' }], name: 'TickLowerOutOfBounds', type: 'Error' },
  { inputs: [{ name: 'tickSpacing', type: 'int24' }], name: 'TickSpacingTooLarge', type: 'Error' },
  { inputs: [{ name: 'tickSpacing', type: 'int24' }], name: 'TickSpacingTooSmall', type: 'Error' },
  { inputs: [{ name: 'tickUpper', type: 'int24' }], name: 'TickUpperOutOfBounds', type: 'Error' },
  {
    inputs: [
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
    ],
    name: 'TicksMisordered',
    type: 'Error',
  },
  { name: 'UnauthorizedDynamicLPFeeUpdate', type: 'Error' },
  { name: 'UnusedBitsNonZero', type: 'Error' },
]

// PositionManager ABI
const positionManagerAbi: AbiItem[] = [
  {
    inputs: [
      { name: '_vault', type: 'address' },
      { name: '_clPoolManager', type: 'address' },
      { name: '_permit2', type: 'address' },
      { name: '_unsubscribeGasLimit', type: 'uint256' },
      { name: '_tokenDescriptor', type: 'address' },
      { name: '_weth9', type: 'address' },
    ],
    stateMutability: 'Nonpayable',
    type: 'Constructor',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'subscriber', type: 'address' },
    ],
    name: 'AlreadySubscribed',
    type: 'Error',
  },
  {
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'reason', type: 'bytes' },
    ],
    name: 'BurnNotificationReverted',
    type: 'Error',
  },
  { name: 'ContractLocked', type: 'Error' },
  { inputs: [{ name: 'deadline', type: 'uint256' }], name: 'DeadlinePassed', type: 'Error' },
  { inputs: [{ name: 'currency', type: 'address' }], name: 'DeltaNotNegative', type: 'Error' },
  { inputs: [{ name: 'currency', type: 'address' }], name: 'DeltaNotPositive', type: 'Error' },
  { name: 'GasLimitTooLow', type: 'Error' },
  { name: 'InputLengthMismatch', type: 'Error' },
  { name: 'InsufficientBalance', type: 'Error' },
  { name: 'InvalidContractSignature', type: 'Error' },
  { name: 'InvalidEthSender', type: 'Error' },
  { name: 'InvalidSignature', type: 'Error' },
  { name: 'InvalidSignatureLength', type: 'Error' },
  { name: 'InvalidSigner', type: 'Error' },
  { inputs: [{ name: 'tick', type: 'int24' }], name: 'InvalidTick', type: 'Error' },
  { name: 'InvalidTokenID', type: 'Error' },
  {
    inputs: [
      { name: 'maximumAmount', type: 'uint128' },
      { name: 'amountRequested', type: 'uint128' },
    ],
    name: 'MaximumAmountExceeded',
    type: 'Error',
  },
  {
    inputs: [
      { name: 'minimumAmount', type: 'uint128' },
      { name: 'amountReceived', type: 'uint128' },
    ],
    name: 'MinimumAmountInsufficient',
    type: 'Error',
  },
  {
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'reason', type: 'bytes' },
    ],
    name: 'ModifyLiquidityNotificationReverted',
    type: 'Error',
  },
  { name: 'NoCodeSubscriber', type: 'Error' },
  { name: 'NoSelfPermit', type: 'Error' },
  { name: 'NonceAlreadyUsed', type: 'Error' },
  { inputs: [{ name: 'caller', type: 'address' }], name: 'NotApproved', type: 'Error' },
  { name: 'NotSubscribed', type: 'Error' },
  { name: 'NotVault', type: 'Error' },
  { name: 'SafeCastOverflow', type: 'Error' },
  { name: 'SignatureDeadlineExpired', type: 'Error' },
  {
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'reason', type: 'bytes' },
    ],
    name: 'SubscriptionReverted',
    type: 'Error',
  },
  { name: 'Unauthorized', type: 'Error' },
  { inputs: [{ name: 'action', type: 'uint256' }], name: 'UnsupportedAction', type: 'Error' },
  { name: 'VaultMustBeUnlocked', type: 'Error' },
  {
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'spender', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'Event',
  },
  {
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'ApprovalForAll',
    type: 'Event',
  },
  { inputs: [{ indexed: true, name: 'tokenId', type: 'uint256' }], name: 'MintPosition', type: 'Event' },
  {
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { name: 'liquidityChange', type: 'int256' },
      { name: 'feesAccrued', type: 'int256' },
    ],
    name: 'ModifyLiquidity',
    type: 'Event',
  },
  {
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'subscriber', type: 'address' },
    ],
    name: 'Subscription',
    type: 'Event',
  },
  {
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'Event',
  },
  {
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'subscriber', type: 'address' },
    ],
    name: 'Unsubscription',
    type: 'Event',
  },
  { outputs: [{ type: 'bytes32' }], name: 'DOMAIN_SEPARATOR', stateMutability: 'view', type: 'function' },
  { outputs: [{ type: 'address' }], name: 'WETH9', stateMutability: 'view', type: 'function' },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'approve',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ type: 'uint256' }],
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    stateMutability: 'view',
    type: 'function',
  },
  { outputs: [{ type: 'address' }], name: 'clPoolManager', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ type: 'address' }],
    inputs: [{ type: 'uint256' }],
    name: 'getApproved',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [
      { name: 'poolKey', type: 'tuple', components: [] },
      { name: 'info', type: 'uint256' },
    ],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getPoolAndPositionInfo',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'liquidity', type: 'uint128' }],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getPositionLiquidity',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ type: 'int24' }],
    inputs: [
      { name: 'key', type: 'tuple' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    name: 'initializePool',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [{ type: 'bool' }],
    inputs: [{ type: 'address' }, { type: 'address' }],
    name: 'isApprovedForAll',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ type: 'bytes' }],
    inputs: [{ name: 'data', type: 'bytes' }],
    name: 'lockAcquired',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'payload', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'modifyLiquidities',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'actions', type: 'bytes' },
      { name: 'params', type: 'bytes[]' },
    ],
    name: 'modifyLiquiditiesWithoutLock',
    stateMutability: 'Payable',
    type: 'Function',
  },
  { outputs: [{ type: 'address' }], name: 'msgSender', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ name: 'results', type: 'bytes[]' }],
    inputs: [{ name: 'data', type: 'bytes[]' }],
    name: 'multicall',
    stateMutability: 'Payable',
    type: 'Function',
  },
  { outputs: [{ type: 'string' }], name: 'name', stateMutability: 'view', type: 'function' },
  { outputs: [{ type: 'uint256' }], name: 'nextTokenId', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ name: 'bitmap', type: 'uint256' }],
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'word', type: 'uint256' },
    ],
    name: 'nonces',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'owner', type: 'address' }],
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'ownerOf',
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'permit',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'err', type: 'bytes' }],
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'permitSingle', type: 'tuple' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'permit',
    stateMutability: 'Payable',
    type: 'Function',
  },
  { outputs: [{ type: 'address' }], name: 'permit2', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ name: 'err', type: 'bytes' }],
    inputs: [
      { name: 'owner', type: 'address' },
      { name: '_permitBatch', type: 'tuple' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'permitBatch',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'permitForAll',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [
      { name: 'currency0', type: 'address' },
      { name: 'currency1', type: 'address' },
      { name: 'hooks', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'parameters', type: 'bytes32' },
    ],
    inputs: [{ name: 'poolId', type: 'bytes25' }],
    name: 'poolKeys',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'info', type: 'uint256' }],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positionInfo',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [
      { name: 'poolKey', type: 'tuple', components: [] },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: '_subscriber', type: 'address' },
    ],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'nonce', type: 'uint256' }],
    name: 'revokeNonce',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'safeTransferFrom',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newSubscriber', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'subscribe',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'subscriber', type: 'address' }],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'subscriber',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ type: 'bool' }],
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    stateMutability: 'view',
    type: 'function',
  },
  { outputs: [{ type: 'string' }], name: 'symbol', stateMutability: 'view', type: 'function' },
  { outputs: [{ type: 'address' }], name: 'tokenDescriptor', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ type: 'string' }],
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'transferFrom',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'unsubscribe',
    stateMutability: 'Payable',
    type: 'Function',
  },
  { outputs: [{ type: 'uint256' }], name: 'unsubscribeGasLimit', stateMutability: 'view', type: 'function' },
  { outputs: [{ type: 'address' }], name: 'vault', stateMutability: 'view', type: 'function' },
  { stateMutability: 'Payable', type: 'Receive' },
]

const uniswapV2Router02Abi: AbiItem[] = [
  {
    inputs: [
      { name: '_factory', type: 'address' },
      { name: '_WETH', type: 'address' },
    ],
    stateMutability: 'Nonpayable',
    type: 'Constructor',
  },
  { stateMutability: 'Payable', type: 'Fallback' },
  { outputs: [{ type: 'address' }], name: 'WETH', stateMutability: 'view', type: 'function' },
  {
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'addLiquidity',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountTokenDesired', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'addLiquidityETH',
    stateMutability: 'Payable',
    type: 'Function',
  },
  { outputs: [{ type: 'address' }], name: 'factory', stateMutability: 'view', type: 'function' },
  {
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'reserveIn', type: 'uint256' },
      { name: 'reserveOut', type: 'uint256' },
    ],
    name: 'getAmountIn',
    stateMutability: 'pure',
    type: 'function',
  },
  {
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'reserveIn', type: 'uint256' },
      { name: 'reserveOut', type: 'uint256' },
    ],
    name: 'getAmountOut',
    stateMutability: 'pure',
    type: 'function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsIn',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'pair', type: 'address' }],
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPairOffChain',
    stateMutability: 'view',
    type: 'function',
  },
  {
    outputs: [{ name: 'amountB', type: 'uint256' }],
    inputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'reserveA', type: 'uint256' },
      { name: 'reserveB', type: 'uint256' },
    ],
    name: 'quote',
    stateMutability: 'pure',
    type: 'function',
  },
  {
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'removeLiquidity',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
    ],
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'removeLiquidityETH',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amountETH', type: 'uint256' }],
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'removeLiquidityETHSupportingFeeOnTransferTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
    ],
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'approveMax', type: 'bool' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'removeLiquidityETHWithPermit',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amountETH', type: 'uint256' }],
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'approveMax', type: 'bool' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'removeLiquidityETHWithPermitSupportingFeeOnTransferTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'approveMax', type: 'bool' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'removeLiquidityWithPermit',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapETHForExactTokens',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokens',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    stateMutability: 'Payable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETH',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'amountInMax', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapTokensForExactETH',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  {
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'amountInMax', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapTokensForExactTokens',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
  { stateMutability: 'Payable', type: 'Receive' },
]

// Permit2 (AllowanceTransfer) contract errors and ABI
const permit2Abi: AbiItem[] = [
  { inputs: [{ name: 'deadline', type: 'uint256' }], name: 'AllowanceExpired', type: 'Error' },
  { inputs: [], name: 'ExcessiveInvalidation', type: 'Error' },
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'InsufficientAllowance', type: 'Error' },
  { inputs: [], name: 'InvalidContractSignature', type: 'Error' },
  { inputs: [], name: 'InvalidNonce', type: 'Error' },
  { inputs: [], name: 'InvalidSignature', type: 'Error' },
  { inputs: [], name: 'InvalidSignatureLength', type: 'Error' },
  { inputs: [], name: 'InvalidSigner', type: 'Error' },
  { inputs: [{ name: 'signatureDeadline', type: 'uint256' }], name: 'SignatureExpired', type: 'Error' },
]

// Combine both ABIs with contract names
const combinedAbis = [
  { abi: universalRouterAbi, contract: 'UniversalRouter' },
  { abi: poolManagerAbi, contract: 'PoolManager' },
  { abi: positionManagerAbi, contract: 'PositionManager' },
  { abi: uniswapV2Router02Abi, contract: 'UniswapV2Router02' },
  { abi: permit2Abi, contract: 'Permit2' },
]

export async function getErrorByTransactionHash(transactionHash: string, network?: string): Promise<string> {
  if (!network) {
    network = 'nile'
  }
  let apiUrl: string
  if (network === 'nile') {
    apiUrl = `https://nile.trongrid.io/wallet/gettransactioninfobyid?value=${transactionHash}`
  } else if (network === 'mainnet') {
    apiUrl = `https://api.trongrid.io/wallet/gettransactioninfobyid?value=${transactionHash}`
  } else {
    throw new Error(`Invalid network: ${network}`)
  }
  try {
    console.log(`Fetching transaction info from: ${apiUrl}`)
    const response = await fetch(apiUrl)
    const txInfo = (await response.json()) as TronGridTransactionInfo

    if (txInfo.contractResult && txInfo.contractResult.length > 0) {
      const selector = txInfo.contractResult[0]

      const found = findErrorBySelector(selector, combinedAbis)

      if (found) {
        return found.name
      }
    }
  } catch (error) {
    throw new Error(`Error fetching transaction info: ${error}`)
  }

  return 'Unknown'
}
