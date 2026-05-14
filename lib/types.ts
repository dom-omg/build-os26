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

export type SSEEvent =
  | { type: 'kernel_boot' }
  | { type: 'agent_spawn'; agent: Agent }
  | { type: 'agent_update'; id: string; status: AgentStatus; output: string }
  | { type: 'agent_done'; id: string; output: string; doneAt: number }
  | { type: 'z3_start'; formula: string }
  | { type: 'z3_result'; result: 'proved' | 'rejected'; trace: string; reason: string }
  | { type: 'system_done'; summary: string; elapsed: number }
  | { type: 'error'; message: string }
