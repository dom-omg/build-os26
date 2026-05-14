'use client'

interface Props {
  formula: string
  trace: string
  result: 'proved' | 'rejected' | null
  reason: string
}

function highlight(line: string): React.ReactNode {
  if (line.startsWith(';')) return <span className="z3-comment">{line}</span>
  if (line.includes('declare-const')) return <span><span className="z3-keyword">declare-const</span><span>{line.replace('(declare-const', '')}</span></span>
  if (line.includes('assert')) return <span><span className="z3-keyword">assert</span><span>{line.replace(/\(assert/, '')}</span></span>
  if (line.includes('check-sat')) return <span className="z3-keyword">{line}</span>
  if (line.includes('get-model')) return <span className="z3-keyword">{line}</span>
  if (line === 'unsat') return <span className="z3-proved">unsat</span>
  if (line === 'sat') return <span className="z3-rejected">sat</span>
  if (line.includes('define-fun')) return <span className="z3-var">{line}</span>
  return <span>{line}</span>
}

export default function ProofTrace({ formula, trace, result, reason }: Props) {
  if (!formula && !result) {
    return (
      <div className="flex items-center justify-center h-full text-os-dim text-xs">
        <div className="text-center space-y-2">
          <div className="text-2xl opacity-30">∅</div>
          <div>Awaiting agent outputs</div>
          <div className="text-[10px]">Z3 verifier will run once agents complete</div>
        </div>
      </div>
    )
  }

  const content = trace || formula

  return (
    <div className="h-full flex flex-col">
      {/* Result banner */}
      {result && (
        <div
          className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-os-border ${
            result === 'proved'
              ? 'bg-os-green/5 border-os-green/20'
              : 'bg-os-red/5 border-os-red/20'
          }`}
        >
          <span className="text-2xl">{result === 'proved' ? '✅' : '❌'}</span>
          <div>
            <div className={`text-sm font-bold tracking-widest ${result === 'proved' ? 'text-os-green' : 'text-os-red'}`}>
              {result === 'proved' ? 'PROVED — UNSAT' : 'REJECTED — SAT'}
            </div>
            <div className="text-[10px] text-os-dim mt-0.5">{reason}</div>
          </div>
        </div>
      )}

      {/* SMT-LIB2 trace */}
      <div className="flex-1 overflow-y-auto p-3">
        <pre className="text-[10px] leading-[1.7] font-mono whitespace-pre-wrap">
          {content.split('\n').map((line, i) => (
            <div key={i} className="hover:bg-white/[0.02] px-1 rounded">
              {highlight(line)}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
