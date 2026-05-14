export type PipelineStepId = 'read_inbox' | 'elaborate_10q' | 'dedup_check' | 'write_spec' | 'sign_cert'

export type PipelineEvent =
  | { type: 'pipeline_start'; ideaId: string; title: string }
  | { type: 'step_start'; step: PipelineStepId; label: string }
  | { type: 'step_progress'; step: PipelineStepId; output: string }
  | { type: 'step_done'; step: PipelineStepId; result: string }
  | { type: 'dedup_pivot'; similarity: number; matchId: string; action: 'merge' | 'continue' }
  | { type: 'spec_ready'; spec: IdeaSpec }
  | { type: 'cert_signed'; cert: SignedCert }
  | { type: 'pipeline_done'; elapsed: number; ideaId: string }
  | { type: 'error'; message: string }

export interface IdeaSpec {
  id: string
  title: string
  rawIdea: string
  category: string
  priority: 'high' | 'medium' | 'low'
  problemStatement: string
  targetMarket: string
  estimatedEffort: string
  nextAction: string
  questions: string[]
  brainStatus: 'new' | 'duplicate' | 'related'
  brainMatchId?: string
  createdAt: string
}

export interface SignedCert {
  ideaId: string
  specHash: string
  signature: string
  publicKey: string
  algorithm: 'Ed25519 + ML-DSA-65'
  mlDsaPublicKey: string
  mlDsaSignature: string
  timestamp: string
}
