export interface PermitDetails {
  token: string
  amount: string
  expiration: string
  nonce: string
}

export interface PermitSingle {
  details: PermitDetails
  spender: string
  sigDeadline: string
}

export interface Permit2Signature extends PermitSingle {
  signature: `0x${string}`
}
