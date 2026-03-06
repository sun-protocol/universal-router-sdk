import { PermitSingle } from '@sun-protocol/permit2-sdk'

export interface Permit2Signature extends PermitSingle {
  signature: `0x${string}`
}
