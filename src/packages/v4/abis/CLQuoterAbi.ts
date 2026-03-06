export const CLQuoterAbi = [
  {
    type: 'constructor',
    inputs: [{ name: '_poolManager', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: '_quoteExactInput',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactParams',
        components: [
          { name: 'exactCurrency', type: 'address', internalType: 'Currency' },
          {
            name: 'path',
            type: 'tuple[]',
            internalType: 'struct PathKey[]',
            components: [
              { name: 'intermediateCurrency', type: 'address', internalType: 'Currency' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'hookData', type: 'bytes', internalType: 'bytes' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: '_quoteExactInputSingle',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactSingleParams',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: '_quoteExactInputSingleList',
    inputs: [
      {
        name: 'swapParamList',
        type: 'tuple[]',
        internalType: 'struct IQuoter.QuoteExactSingleParams[]',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: '_quoteExactOutput',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactParams',
        components: [
          { name: 'exactCurrency', type: 'address', internalType: 'Currency' },
          {
            name: 'path',
            type: 'tuple[]',
            internalType: 'struct PathKey[]',
            components: [
              { name: 'intermediateCurrency', type: 'address', internalType: 'Currency' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'hookData', type: 'bytes', internalType: 'bytes' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: '_quoteExactOutputSingle',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactSingleParams',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'lockAcquired',
    inputs: [{ name: 'data', type: 'bytes', internalType: 'bytes' }],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'poolManager',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract ICLPoolManager' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'quoteExactInput',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactParams',
        components: [
          { name: 'exactCurrency', type: 'address', internalType: 'Currency' },
          {
            name: 'path',
            type: 'tuple[]',
            internalType: 'struct PathKey[]',
            components: [
              { name: 'intermediateCurrency', type: 'address', internalType: 'Currency' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'hookData', type: 'bytes', internalType: 'bytes' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256', internalType: 'uint256' },
      { name: 'gasEstimate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactSingleParams',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256', internalType: 'uint256' },
      { name: 'gasEstimate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteExactInputSingleList',
    inputs: [
      {
        name: 'params',
        type: 'tuple[]',
        internalType: 'struct IQuoter.QuoteExactSingleParams[]',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'gasEstimate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteExactOutput',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactParams',
        components: [
          { name: 'exactCurrency', type: 'address', internalType: 'Currency' },
          {
            name: 'path',
            type: 'tuple[]',
            internalType: 'struct PathKey[]',
            components: [
              { name: 'intermediateCurrency', type: 'address', internalType: 'Currency' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'hookData', type: 'bytes', internalType: 'bytes' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'gasEstimate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteExactOutputSingle',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        internalType: 'struct IQuoter.QuoteExactSingleParams',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            internalType: 'struct PoolKey',
            components: [
              { name: 'currency0', type: 'address', internalType: 'Currency' },
              { name: 'currency1', type: 'address', internalType: 'Currency' },
              { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
              { name: 'fee', type: 'uint24', internalType: 'uint24' },
              { name: 'parameters', type: 'bytes32', internalType: 'bytes32' },
            ],
          },
          { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
          { name: 'exactAmount', type: 'uint128', internalType: 'uint128' },
          { name: 'hookData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'gasEstimate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'vault',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IVault' }],
    stateMutability: 'view',
  },
  { type: 'error', name: 'NotEnoughLiquidity', inputs: [{ name: 'poolId', type: 'bytes32', internalType: 'PoolId' }] },
  { type: 'error', name: 'NotSelf', inputs: [] },
  { type: 'error', name: 'NotVault', inputs: [] },
  { type: 'error', name: 'QuoteSwap', inputs: [{ name: 'amount', type: 'uint256', internalType: 'uint256' }] },
  { type: 'error', name: 'UnexpectedCallSuccess', inputs: [] },
  {
    type: 'error',
    name: 'UnexpectedRevertBytes',
    inputs: [{ name: 'revertData', type: 'bytes', internalType: 'bytes' }],
  },
] as const
