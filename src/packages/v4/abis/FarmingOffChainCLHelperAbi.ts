export const FARMING_OFFCHAIN_CL_HELPER_ABI = [
  {
    type: 'function',
    name: 'getLPFees',
    inputs: [
      { name: 'poolManager', type: 'address', internalType: 'contract ICLPoolManager' },
      { name: 'id', type: 'bytes32', internalType: 'PoolId' },
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'tickLower', type: 'int24', internalType: 'int24' },
      { name: 'tickUpper', type: 'int24', internalType: 'int24' },
      { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'feesOwed0', type: 'uint256', internalType: 'uint256' },
      { name: 'feesOwed1', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const
