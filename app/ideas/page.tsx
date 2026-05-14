'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PipelineEvent, IdeaSpec, SignedCert, PipelineStepId } from '@/lib/ideas-types'

const STEP_LABELS: Record<PipelineStepId, string> = {
  read_inbox: 'read_inbox',
  elaborate_10q: 'elaborate_10q',
  dedup_check: 'dedup_check',
  write_spec: 'write_spec',
  sign_cert: 'sign_cert',
}

const STEP_ORDER: PipelineStepId[] = ['read_inbox', 'elaborate_10q', 'dedup_check', 'write_spec', 'sign_cert']

interface StepState {
  status: 'idle' | 'running' | 'done' | 'pivot'
  result: string
  progress: string
}

interface PipelineState {
  phase: 'idle' | 'running' | 'done' | 'error'
  ideaId: string
  title: string
  steps: Record<PipelineStepId, StepState>
  dedupPivot: { similarity: number; matchId: string; action: 'merge' | 'continue' } | null
  spec: IdeaSpec | null
  cert: SignedCert | null
  elapsed: number
  error: string
}

const EMPTY_STEPS: Record<PipelineStepId, StepState> = {
  read_inbox: { status: 'idle', result: '', progress: '' },
  elaborate_10q: { status: 'idle', result: '', progress: '' },
  dedup_check: { status: 'idle', result: '', progress: '' },
  write_spec: { status: 'idle', result: '', progress: '' },
  sign_cert: { status: 'idle', result: '', progress: '' },
}

const INITIAL: PipelineState = {
  phase: 'idle',
  ideaId: '',
  title: '',
  steps: EMPTY_STEPS,
  dedupPivot: null,
  spec: null,
  cert: null,
  elapsed: 0,
  error: '',
}

interface InboxItem {
  id: string
  preview: string
  date: string
}

export default function IdeasPage() {
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [selected, setSelected] = useState<string>('')
  const [state, setState] = useState<PipelineState>(INITIAL)
  const [tick, setTick] = useState(0)
  const startRef = useRef<number>(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/ideas')
      .then((r) => r.json())
      .then(setInbox)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (state.phase !== 'running') return
    const id = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [state.phase])

  const elapsedDisplay =
    state.phase === 'done' || state.phase === 'error'
      ? (state.elapsed / 1000).toFixed(1) + 's'
      : state.phase === 'running'
      ? ((Date.now() - startRef.current) / 1000).toFixed(1) + 's'
      : '—'

  const run = useCallback(async () => {
    if (!selected && inbox.length === 0) return
    const ideaId = selected || '__random__'

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState({ ...INITIAL, phase: 'running' })
    startRef.current = Date.now()

    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) throw new Error('Pipeline failed to start')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as PipelineEvent
            setState((prev) => applyEvent(prev, event))
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setState((prev) => ({ ...prev, phase: 'error', error: (err as Error).message }))
    }
  }, [selected, inbox])

  return (
    <main className="min-h-screen bg-black text-white font-mono p-6 md:p-10">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-8 border-b border-zinc-800 pb-6">
          <div className="text-xs text-zinc-500 mb-1">OMEGA / FOUNDER-IDEA-PIPELINE · BUILD OS26</div>
          <h1 className="text-2xl font-bold tracking-tight">Founder Idea Pipeline</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Raw founder idea → 10 questions → Brain dedup → structured spec → signed cert
          </p>
        </div>

        {/* Inbox selector */}
        <div className="mb-6">
          <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Select idea from inbox ({inbox.length} loaded)</div>
          <div className="grid gap-2">
            {inbox.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item.id)}
                className={`text-left px-4 py-3 rounded border transition-colors ${
                  selected === item.id
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-zinc-800 hover:border-zinc-600 text-zinc-300'
                }`}
              >
                <span className="text-xs text-zinc-500 mr-3">{item.id}</span>
                <span className="text-sm">{item.preview}</span>
                <span className="text-xs text-zinc-600 ml-3">{item.date}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={state.phase === 'running' || inbox.length === 0}
          className="w-full py-3 px-6 rounded border border-blue-500 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold tracking-wider uppercase text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-8"
        >
          {state.phase === 'running' ? `▶ PIPELINE RUNNING — ${elapsedDisplay}` : '▶ RUN PIPELINE'}
        </button>

        {/* Pipeline steps */}
        {state.phase !== 'idle' && (
          <div className="space-y-3 mb-8">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Pipeline execution</div>

            {state.title && (
              <div className="text-sm text-zinc-300 mb-4 px-1">
                Processing: <span className="text-white font-semibold">{state.title}</span>
              </div>
            )}

            {STEP_ORDER.map((step, idx) => {
              const s = state.steps[step]
              const isActive = s.status === 'running'
              const isDone = s.status === 'done'
              const isPivot = s.status === 'pivot'

              return (
                <div key={step}>
                  <div
                    className={`flex items-start gap-3 px-4 py-3 rounded border transition-all ${
                      isActive
                        ? 'border-yellow-500/60 bg-yellow-500/5'
                        : isDone
                        ? 'border-green-500/40 bg-green-500/5'
                        : isPivot
                        ? 'border-orange-500/60 bg-orange-500/5'
                        : 'border-zinc-800/60'
                    }`}
                  >
                    <span className="text-xs text-zinc-600 w-5 mt-0.5 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-semibold ${
                          isActive ? 'text-yellow-400' : isDone ? 'text-green-400' : isPivot ? 'text-orange-400' : 'text-zinc-600'
                        }`}>
                          {STEP_LABELS[step]}
                        </span>
                        {isActive && (
                          <span className="text-xs text-yellow-500 animate-pulse">● running</span>
                        )}
                        {isDone && <span className="text-xs text-green-500">✓ done</span>}
                        {isPivot && <span className="text-xs text-orange-400">⚡ PIVOT</span>}
                      </div>
                      {s.progress && isActive && (
                        <div className="text-xs text-zinc-500 truncate">{s.progress}</div>
                      )}
                      {s.result && (
                        <div className="text-xs text-zinc-400 mt-0.5">{s.result}</div>
                      )}
                    </div>
                  </div>

                  {/* Dedup pivot card */}
                  {step === 'dedup_check' && state.dedupPivot && (
                    <div className="ml-8 mt-1 px-4 py-3 rounded border border-orange-500/50 bg-orange-500/5">
                      <div className="text-xs text-orange-400 font-bold mb-1">
                        ⚡ BRAIN PIVOT — {state.dedupPivot.similarity}% similar to {state.dedupPivot.matchId}
                      </div>
                      <div className="text-xs text-zinc-400">
                        Agent action:{' '}
                        {state.dedupPivot.action === 'merge'
                          ? 'Flagging as duplicate → routing to merge workflow instead of new spec'
                          : 'Related but distinct → continuing with differentiation notes'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Results */}
        {state.phase === 'done' && state.spec && (
          <div className="space-y-4">
            {/* Spec */}
            <div className="border border-zinc-700 rounded p-5">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Generated Spec — {state.spec.id}</div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
                <div>
                  <span className="text-zinc-500">title</span>
                  <div className="text-white font-semibold">{state.spec.title}</div>
                </div>
                <div>
                  <span className="text-zinc-500">category</span>
                  <div className="text-white">{state.spec.category}</div>
                </div>
                <div>
                  <span className="text-zinc-500">priority</span>
                  <div className={`font-semibold ${
                    state.spec.priority === 'high' ? 'text-red-400'
                    : state.spec.priority === 'medium' ? 'text-yellow-400'
                    : 'text-green-400'
                  }`}>{state.spec.priority}</div>
                </div>
                <div>
                  <span className="text-zinc-500">effort</span>
                  <div className="text-white">{state.spec.estimatedEffort}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-500">problem</span>
                  <div className="text-white">{state.spec.problemStatement}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-500">market</span>
                  <div className="text-white">{state.spec.targetMarket}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-500">next action</span>
                  <div className="text-blue-400 font-semibold">{state.spec.nextAction}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-500">brain status</span>
                  <div className={`font-semibold ${
                    state.spec.brainStatus === 'new' ? 'text-green-400'
                    : state.spec.brainStatus === 'related' ? 'text-yellow-400'
                    : 'text-red-400'
                  }`}>
                    {state.spec.brainStatus}
                    {state.spec.brainMatchId ? ` (matched ${state.spec.brainMatchId})` : ''}
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <div className="text-xs text-zinc-500 mb-2">10 Elaboration Questions</div>
                <ol className="space-y-1">
                  {state.spec.questions.map((q, i) => (
                    <li key={i} className="text-xs text-zinc-400">
                      <span className="text-zinc-600 mr-2">{i + 1}.</span>{q}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Cert */}
            {state.cert && (
              <div className="border border-zinc-800 rounded p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Decision Certificate</div>
                <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">algorithm</span>
                    <span className="text-green-400">{state.cert.algorithm}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">idea</span>
                    <span className="text-zinc-300">{state.cert.ideaId}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">hash</span>
                    <span className="text-zinc-400 break-all">{state.cert.specHash.slice(0, 32)}...</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">sig</span>
                    <span className="text-zinc-400 break-all">{state.cert.signature.slice(0, 32)}...</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">pubkey</span>
                    <span className="text-zinc-400 break-all">{state.cert.publicKey.slice(0, 32)}...</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-600 w-16 shrink-0">signed</span>
                    <span className="text-zinc-300">{state.cert.timestamp}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="text-center text-xs text-zinc-500 py-2">
              Pipeline completed in <span className="text-white font-semibold">{elapsedDisplay}</span>
              {' '}·{' '}
              {inbox.length} ideas in inbox · 5 tools executed · 1 spec signed
            </div>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="border border-red-500/40 bg-red-500/5 rounded p-4 text-red-400 text-sm">
            Error: {state.error}
          </div>
        )}
      </div>
    </main>
  )
}

function applyEvent(prev: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.type) {
    case 'pipeline_start':
      return { ...prev, ideaId: event.ideaId, title: event.title }

    case 'step_start':
      return {
        ...prev,
        steps: {
          ...prev.steps,
          [event.step]: { status: 'running', result: event.label, progress: '' },
        },
      }

    case 'step_progress':
      return {
        ...prev,
        steps: {
          ...prev.steps,
          [event.step]: { ...prev.steps[event.step], progress: event.output },
        },
      }

    case 'step_done':
      return {
        ...prev,
        steps: {
          ...prev.steps,
          [event.step]: { status: 'done', result: event.result, progress: '' },
        },
      }

    case 'dedup_pivot':
      return {
        ...prev,
        dedupPivot: { similarity: event.similarity, matchId: event.matchId, action: event.action },
        steps: {
          ...prev.steps,
          dedup_check: { ...prev.steps.dedup_check, status: 'pivot' },
        },
      }

    case 'spec_ready':
      return { ...prev, spec: event.spec }

    case 'cert_signed':
      return { ...prev, cert: event.cert }

    case 'pipeline_done':
      return { ...prev, phase: 'done', elapsed: event.elapsed }

    case 'error':
      return { ...prev, phase: 'error', error: event.message }

    default:
      return prev
  }
}
