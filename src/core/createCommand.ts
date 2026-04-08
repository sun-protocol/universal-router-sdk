import { AbiParametersToPrimitiveTypes } from 'abitype'
import { AbiParameter, Hex, encodeAbiParameters, parseAbiParameters } from 'viem'
import { CommandType } from '../types'
export type ABIType = { [key in CommandUsed]: readonly AbiParameter[] }
export type ABIParametersType<TCommandType extends CommandUsed> = AbiParametersToPrimitiveTypes<
  (typeof ABI_PARAMETER)[TCommandType]
>

const ABI_STRUCT_PERMIT_DETAILS = `
struct PermitDetails {
  address token;
  uint160 amount;
  uint48 expiration;
  uint48 nonce;
}`.replaceAll('\n', '')

const ABI_STRUCT_PERMIT_SINGLE = `
struct PermitSingle {
  PermitDetails details;
  address spender;
  uint256 sigDeadline;
}
`.replaceAll('\n', '')

const ABI_STRUCT_PERMIT_BATCH = `
struct PermitBatch {
  PermitDetails[] details;
  address spender;
  uint256 sigDeadline;
}
`.replaceAll('\n', '')

const ABI_STRUCT_ALLOWANCE_TRANSFER_DETAILS = `
struct AllowanceTransferDetails {
  address from;
  address to;
  uint160 amount;
  address token;
}
`.replaceAll('\n', '')

const ABI_STRUCT_POOL_KEY = `
struct PoolKey {
  address currency0;
  address currency1;
  address hooks;
  uint24 fee;
  bytes32 parameters;
}
`.replaceAll('\n', '')

export const ABI_PARAMETER = {
  // Batch Reverts
  [CommandType.EXECUTE_SUB_PLAN]: parseAbiParameters('bytes _commands, bytes[] _inputs'),

  // Permit2 Actions
  [CommandType.PERMIT2_PERMIT]: parseAbiParameters([
    'PermitSingle permitSingle, bytes data',
    ABI_STRUCT_PERMIT_SINGLE,
    ABI_STRUCT_PERMIT_DETAILS,
  ]),
  [CommandType.PERMIT2_PERMIT_BATCH]: parseAbiParameters([
    'PermitBatch permitBatch, bytes data',
    ABI_STRUCT_PERMIT_BATCH,
    ABI_STRUCT_PERMIT_DETAILS,
  ]),
  [CommandType.PERMIT2_TRANSFER_FROM]: parseAbiParameters('address token, address recipient, uint160 amount'),
  [CommandType.PERMIT2_TRANSFER_FROM_BATCH]: parseAbiParameters([
    'AllowanceTransferDetails[] batchDetails',
    ABI_STRUCT_ALLOWANCE_TRANSFER_DETAILS,
  ]),

  // V3 Swap Actions
  [CommandType.V3_SWAP_EXACT_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'
  ),
  [CommandType.V3_SWAP_EXACT_OUT]: parseAbiParameters(
    'address recipient, uint256 amountOut, uint256 amountInMax, bytes path, bool payerIsUser'
  ),

  // V2 Swap Actions
  [CommandType.V2_SWAP_EXACT_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'
  ),
  [CommandType.V2_SWAP_EXACT_OUT]: parseAbiParameters(
    'address recipient, uint256 amountOut, uint256 amountInMax, address[] path, bool payerIsUser'
  ),

  // V1 Swap Actions
  [CommandType.V1_SWAP_EXACT_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'
  ),
  [CommandType.V1_SWAP_EXACT_OUT]: parseAbiParameters(
    'address recipient, uint256 amountOut, uint256 amountInMin, address[] path, bool payerIsUser'
  ),

  // Stable Swap Actions
  [CommandType.STABLE_SWAP_EXACT_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, uint256[] flag, bool payerIsUser'
  ),
  // [CommandType.STABLE_SWAP_EXACT_OUT]: parseAbiParameters(
  //   'address recipient, uint256 amountOut, uint256 amountInMax, address[] path, uint256[] flag, bool payerIsUser'
  // ),

  // PSM Swap Actions
  [CommandType.PSM_SWAP_EXACT_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, uint256[] flag, bool payerIsUser'
  ),
  [CommandType.PSM_SWAP_EXACT_OUT]: parseAbiParameters(
    'address recipient, uint256 amountOut, uint256 amountInMax, address[] path, uint256[] flag, bool payerIsUser'
  ),

  // HTX Sun Swap Actions
  [CommandType.HTX_SUN_SWAP_IN]: parseAbiParameters(
    'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, uint256[] flag, bool payerIsUser'
  ),
  [CommandType.HTX_SUN_SWAP_OUT]: parseAbiParameters(
    'address recipient, uint256 amountOut, uint256 amountInMax, address[] path, uint256[] flag, bool payerIsUser'
  ),

  // Token Actions and Checks
  [CommandType.WRAP_ETH]: parseAbiParameters('address recipient, uint256 amount'),
  [CommandType.UNWRAP_WETH]: parseAbiParameters('address recipient, uint256 amountMin'),
  [CommandType.SWEEP]: parseAbiParameters('address token, address recipient, uint160 amountMin'),
  [CommandType.TRANSFER]: parseAbiParameters('address token, address recipient, uint256 value'),
  [CommandType.PAY_PORTION]: parseAbiParameters('address token, address recipient, uint256 bips'),
  [CommandType.PAY_REFERRAL]: parseAbiParameters('address token, address project, uint256 bips'),
  [CommandType.BALANCE_CHECK_ERC20]: parseAbiParameters('address owner, address token, uint256 minBalance'),

  // Infinity Swap Actions
  [CommandType.V4_SWAP]: parseAbiParameters('bytes actions, bytes[] params'),

  // V3 Position Manager Actions
  [CommandType.V3_POSITION_MANAGER_PERMIT]: parseAbiParameters('bytes data'),
  [CommandType.V3_POSITION_MANAGER_CALL]: parseAbiParameters('bytes data'),

  // Infinity CL Actions
  [CommandType.V4_CL_INITIALIZE_POOL]: parseAbiParameters([
    'PoolKey poolKey, uint160 sqrtPriceX96',
    ABI_STRUCT_POOL_KEY,
  ]),
  [CommandType.V4_CL_POSITION_CALL]: parseAbiParameters('bytes data'),
}

export type CommandUsed = keyof typeof ABI_PARAMETER

export type RouterCommand = {
  type: CommandUsed
  encodedInput: Hex
}

export function createCommand<TCommandType extends CommandUsed>(
  type: TCommandType,
  parameters: ABIParametersType<TCommandType>
): RouterCommand {
  // const params = parameters.filter((param) => param !== null)
  const encodedInput = encodeAbiParameters(ABI_PARAMETER[type], parameters as any)
  return { type, encodedInput }
}
