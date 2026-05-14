// lib/types.ts

export type AgentStatus = 'spawning' | 'running' | 'thinking' | 'waiting' | 'verifying' | 'done' | 'error'

export interface Agent {
  id: string
  name: string
  role: string
  task: string
  status: AgentStatus
  output: string
  startedAt: number
  doneAt?: number
}

export interface Z3Counterexample {
  variable: string
  label: string
  description: string
}

export type SSEEvent =
  | { type: 'kernel_boot' }
  | { type: 'agent_spawn'; agent: Agent }
  | { type: 'agent_update'; id: string; status: AgentStatus; output: string }
  | { type: 'agent_done'; id: string; output: string; doneAt: number }
  | { type: 'z3_start'; formula: string }
  | { type: 'z3_result'; result: 'proved' | 'rejected' | 'undecided'; trace: string; reason: string; counterexample: Z3Counterexample | null }
  | { type: 'system_done'; summary: string; elapsed: number }
  | { type: 'error'; message: string }
