'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import AgentRow from '@/components/AgentRow'
import ProofTrace from '@/components/ProofTrace'
import type { Agent, SSEEvent } from '@/lib/types'

const EXAMPLES = [
  'Production server down for 2h, DB connection timeout, 5000 users affected. Determine root cause and recovery action.',
  'Suspicious wallet transferred $4.2M in 3 hops through mixers in the last 30 minutes. Assess and recommend action.',
  'AI model approved a loan with missing collateral data. Audit the decision chain and prevent future violations.',
  'Government contractor leaked classified credentials on GitHub at 02:47 UTC. Scope the breach and contain.',
]

interface SystemState {
  phase: 'idle' | 'booting' | 'running' | 'done' | 'error'
  agents: Agent[]
  z3Formula: string
  z3Trace: string
  z3Result: 'proved' | 'rejected' | null
  z3Reason: string
  summary: string
  elapsed: number
  errorMsg: string
}

const INITIAL: SystemState = {
  phase: 'idle',
  agents: [],
  z3Formula: '',
  z3Trace: '',
  z3Result: null,
  z3Reason: '',
  summary: '',
  elapsed: 0,
  errorMsg: '',
}

export default function HomePage() {
  const [scenario, setScenario] = useState('')
  const [state, setState] = useState<SystemState>(INITIAL)
  const [tick, setTick] = useState(0)
  const agentsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startRef = useRef<number>(0)

  // Live elapsed timer
  useEffect(() => {
    if (state.phase !== 'running' && state.phase !== 'booting') return
    const id = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [state.phase])

  const elapsedDisplay =
    state.phase === 'done' || state.phase === 'error'
      ? (state.elapsed / 1000).toFixed(1) + 's'
      : state.phase === 'running' || state.phase === 'booting'
      ? ((Date.now() - startRef.current) / 1000).toFixed(1) + 's'
      : '—'

  const handleRunWith = useCallback(async (text: string) => {
    if (!text.trim() || state.phase === 'running' || state.phase === 'booting') return
    setScenario(text)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    startRef.current = Date.now()

    setState({ ...INITIAL, phase: 'booting' })

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: text }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue

          let event: SSEEvent
          try { event = JSON.parse(line) } catch { continue }

          setState((prev) => {
            switch (event.type) {
              case 'kernel_boot':
                return { ...prev, phase: 'running' }
              case 'agent_spawn':
                return { ...prev, agents: [...prev.agents, event.agent] }
              case 'agent_update':
                return { ...prev, agents: prev.agents.map((a) => a.id === event.id ? { ...a, status: event.status, output: event.output } : a) }
              case 'agent_done':
                return { ...prev, agents: prev.agents.map((a) => a.id === event.id ? { ...a, status: 'done', output: event.output, doneAt: event.doneAt } : a) }
              case 'z3_start':
                return { ...prev, z3Formula: event.formula, agents: prev.agents.map((a) => a.name === 'Z3-Verifier' ? { ...a, status: 'verifying' } : a) }
              case 'z3_result':
                return { ...prev, z3Trace: event.trace, z3Result: event.result, z3Reason: event.reason }
              case 'system_done':
                return { ...prev, phase: 'done', summary: event.summary, elapsed: event.elapsed }
              case 'error':
                return { ...prev, phase: 'error', errorMsg: event.message }
              default:
                return prev
            }
          })

          setTimeout(() => {
            agentsRef.current?.scrollTo({ top: agentsRef.current.scrollHeight, behavior: 'smooth' })
          }, 50)
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setState((prev) => ({ ...prev, phase: 'error', errorMsg: (err as Error).message }))
      }
    }
  }, [state.phase])

  const handleRun = useCallback(() => handleRunWith(scenario), [handleRunWith, scenario])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
  }

  const doneCount = state.agents.filter((a) => a.status === 'done').length
  const totalCount = state.agents.length
  const isRunning = state.phase === 'running' || state.phase === 'booting'

  return (
    <div className="h-screen flex flex-col bg-os-bg overflow-hidden select-none">

      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-os-border bg-os-panel">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-os-red/70" />
            <div className="w-3 h-3 rounded-full bg-os-amber/70" />
            <div className="w-3 h-3 rounded-full bg-os-green/70" />
          </div>
          <span className="text-os-green font-bold text-sm tracking-widest">AGENT-OS</span>
          <span className="text-os-dim text-xs">KERNEL v0.1</span>
          <a href="/ideas" className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/40 hover:border-blue-400 px-2 py-0.5 rounded transition-colors ml-2">IDEA PIPELINE</a>
        </div>

        <div className="flex items-center gap-6 text-[10px] text-os-dim">
          <div>
            <span className="text-os-text">AGENTS </span>
            <span className={doneCount === totalCount && totalCount > 0 ? 'text-os-green' : 'text-os-amber'}>
              {doneCount}/{totalCount || '—'}
            </span>
          </div>
          <div>
            <span className="text-os-text">Z3 </span>
            <span className={
              state.z3Result === 'proved' ? 'text-os-green font-bold' :
              state.z3Result === 'rejected' ? 'text-os-red font-bold' :
              'text-os-dim'
            }>
              {state.z3Result ? state.z3Result.toUpperCase() : 'PENDING'}
            </span>
          </div>
          <div>
            <span className="text-os-text">TIME </span>
            <span className="tabular-nums">{elapsedDisplay}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'dot-running' :
                state.phase === 'done' ? 'dot-done' :
                state.phase === 'error' ? 'dot-error' :
                'dot-waiting'
              }`}
            />
            <span className="uppercase tracking-widest">
              {state.phase === 'idle' ? 'IDLE' :
               state.phase === 'booting' ? 'BOOTING' :
               state.phase === 'running' ? 'RUNNING' :
               state.phase === 'done' ? 'COMPLETE' : 'ERROR'}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN 3-PANEL GRID ────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[300px_1fr_380px] gap-2 p-2 min-h-0">

        {/* ── PANEL 1: INPUT ─────────────────────────────────── */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-os-border">
            <span className="w-2 h-2 rounded-full bg-os-blue" />
            <span className="text-[10px] text-os-dim tracking-widest uppercase">Input</span>
          </div>

          <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
            <textarea
              className="flex-1 resize-none bg-transparent text-os-text text-xs font-mono leading-relaxed outline-none border border-os-border/50 rounded p-3 placeholder-os-dim/40 focus:border-os-green/30 transition-colors"
              placeholder="Paste scenario here…&#10;&#10;Ctrl+Enter to run"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />

            {/* Examples */}
            <div className="flex-shrink-0 space-y-1">
              <div className="text-[9px] text-os-dim uppercase tracking-widest mb-1.5">Examples</div>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleRunWith(ex)}
                  disabled={isRunning}
                  className="w-full text-left text-[9px] text-os-dim/70 hover:text-os-green/80 disabled:opacity-30 transition-colors leading-relaxed truncate"
                >
                  {'▶ '}{ex.slice(0, 55)}…
                </button>
              ))}
            </div>

            {/* Launch button */}
            <button
              onClick={handleRun}
              disabled={!scenario.trim() || isRunning}
              className={`flex-shrink-0 py-2.5 px-4 text-xs font-bold tracking-widest uppercase rounded transition-all border ${
                isRunning
                  ? 'border-os-amber text-os-amber cursor-not-allowed opacity-70'
                  : scenario.trim()
                  ? 'border-os-green text-os-green hover:bg-os-green/10 animate-glow_green'
                  : 'border-os-border text-os-dim cursor-not-allowed'
              }`}
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="dot-thinking w-2 h-2 rounded-full inline-block" />
                  Running kernel…
                </span>
              ) : (
                '▶ Launch'
              )}
            </button>

            {/* Reset */}
            {(state.phase === 'done' || state.phase === 'error') && (
              <button
                onClick={() => setState(INITIAL)}
                className="flex-shrink-0 py-1.5 text-[10px] text-os-dim hover:text-os-text transition-colors text-center"
              >
                ↺ Reset kernel
              </button>
            )}
          </div>
        </div>

        {/* ── PANEL 2: LIVE AGENTS ───────────────────────────── */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-os-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-os-amber" />
              <span className="text-[10px] text-os-dim tracking-widest uppercase">Live Agents</span>
            </div>
            {totalCount > 0 && (
              <span className="text-[9px] text-os-dim">{doneCount}/{totalCount} complete</span>
            )}
          </div>

          {/* Column headers */}
          {totalCount > 0 && (
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-os-border/30 text-[9px] text-os-dim uppercase tracking-widest">
              <span className="w-2 h-2" />
              <span className="w-6">ID</span>
              <span className="w-24">Name</span>
              <span className="w-20">Role</span>
              <span className="w-12">Status</span>
              <span className="ml-auto">Time</span>
            </div>
          )}

          <div ref={agentsRef} className="flex-1 overflow-y-auto">
            {state.agents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-os-dim text-xs text-center p-6">
                {state.phase === 'idle' ? (
                  <div className="space-y-2">
                    <div className="text-3xl opacity-20">⬡</div>
                    <div>Kernel idle</div>
                    <div className="text-[10px]">Paste a scenario and launch</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="dot-running w-2 h-2 rounded-full inline-block" />
                    Booting kernel…
                  </div>
                )}
              </div>
            ) : (
              state.agents.map((agent, i) => (
                <AgentRow key={agent.id} agent={agent} index={i} />
              ))
            )}
          </div>

          {/* Summary bar */}
          {state.phase === 'done' && state.summary && (
            <div className="flex-shrink-0 border-t border-os-green/20 bg-os-green/5 px-3 py-2">
              <div className="text-[9px] text-os-green/60 uppercase tracking-widest mb-0.5">Decision</div>
              <div className="text-xs text-os-green">{state.summary}</div>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="flex-shrink-0 border-t border-os-red/20 bg-os-red/5 px-3 py-2">
              <div className="text-[9px] text-os-red/60 uppercase tracking-widest mb-0.5">Kernel Error</div>
              <div className="text-xs text-os-red">{state.errorMsg}</div>
            </div>
          )}
        </div>

        {/* ── PANEL 3: Z3 PROOF ──────────────────────────────── */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-os-border">
            <span className={`w-2 h-2 rounded-full ${
              state.z3Result === 'proved' ? 'bg-os-green' :
              state.z3Result === 'rejected' ? 'bg-os-red' :
              'bg-os-blue'
            }`} />
            <span className="text-[10px] text-os-dim tracking-widest uppercase">Z3 Formal Proof</span>
          </div>

          <div className="flex-1 overflow-hidden">
            <ProofTrace
              formula={state.z3Formula}
              trace={state.z3Trace}
              result={state.z3Result}
              reason={state.z3Reason}
            />
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="flex-shrink-0 flex items-center justify-between px-5 py-1.5 border-t border-os-border text-[9px] text-os-dim">
        <span>AGENT-OS · Build OS26 · Mila 2026</span>
        <span>
          {isRunning && (
            <span className="flex items-center gap-1.5">
              <span className="dot-running w-1.5 h-1.5 rounded-full inline-block" />
              kernel running
            </span>
          )}
        </span>
        <span>Z3 · Claude · Formal Verification</span>
      </footer>
    </div>
  )
}
