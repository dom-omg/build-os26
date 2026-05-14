'use client'

import type { Agent } from '@/lib/types'

const STATUS_LABEL: Record<Agent['status'], string> = {
  spawning:  'SPAWN',
  running:   'RUN  ',
  thinking:  'THINK',
  waiting:   'WAIT ',
  verifying: 'VERIF',
  done:      'DONE ',
  error:     'ERROR',
}

const STATUS_COLOR: Record<Agent['status'], string> = {
  spawning:  'text-os-dim',
  running:   'text-os-green',
  thinking:  'text-os-amber',
  waiting:   'text-os-dim',
  verifying: 'text-os-blue',
  done:      'text-os-green',
  error:     'text-os-red',
}

const ROLE_COLOR: Record<string, string> = {
  KERNEL:       'text-os-blue',
  RECON:        'text-os-amber',
  ANALYSIS:     'text-os-amber',
  EXECUTION:    'text-os-green',
  'FORMAL PROOF': 'text-os-blue',
}

interface Props {
  agent: Agent
  index: number
}

export default function AgentRow({ agent, index }: Props) {
  const elapsed =
    agent.doneAt != null
      ? ((agent.doneAt - agent.startedAt) / 1000).toFixed(1) + 's'
      : '…'

  return (
    <div
      className="animate-slide-in border-b border-os-border/40 py-2 px-3"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 text-xs">
        {/* Dot */}
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 dot-${agent.status}`}
        />

        {/* ID */}
        <span className="text-os-dim w-6 flex-shrink-0">{agent.id}</span>

        {/* Name */}
        <span className="text-os-text font-mono w-24 flex-shrink-0 truncate">
          {agent.name}
        </span>

        {/* Role */}
        <span className={`w-20 flex-shrink-0 text-[10px] ${ROLE_COLOR[agent.role] ?? 'text-os-dim'}`}>
          {agent.role}
        </span>

        {/* Status */}
        <span className={`w-12 flex-shrink-0 font-bold ${STATUS_COLOR[agent.status]}`}>
          {STATUS_LABEL[agent.status]}
        </span>

        {/* Elapsed */}
        <span className="text-os-dim ml-auto">{elapsed}</span>
      </div>

      {/* Task line */}
      <div className="mt-1 ml-5 text-[10px] text-os-dim truncate">
        {'→ '}{agent.task}
      </div>

      {/* Output (done state) */}
      {agent.output && agent.status === 'done' && (
        <div className="mt-1.5 ml-5 text-[10px] text-os-text/70 leading-relaxed border-l border-os-border pl-2 line-clamp-3">
          {agent.output}
        </div>
      )}
    </div>
  )
}
