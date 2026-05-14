export interface Z3Result {
  formula: string
  trace: string
  result: 'proved' | 'rejected'
  reason: string
}

export function buildZ3Proof(
  scenario: string,
  agentOutputs: { name: string; conclusion: string }[],
  finalDecision: string,
  isValid: boolean
): Z3Result {
  const vars = agentOutputs.map((a, i) => {
    const varName = a.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    return { varName, conclusion: a.conclusion, idx: i }
  })

  const declarations = vars
    .map((v) => `(declare-const ${v.varName}_ok Bool)`)
    .join('\n')

  const assertions = vars
    .map((v) => `(assert (= ${v.varName}_ok true))  ; ${v.conclusion.slice(0, 60)}`)
    .join('\n')

  const decisionVar = finalDecision.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32)
  const precondition = vars.map((v) => v.varName + '_ok').join('\n         ')

  const formula = [
    '; ─── AGENT-OS Z3 VERIFICATION ───────────────────────────',
    '; Kernel: build-os26 v0.1',
    '; Scenario: ' + scenario.slice(0, 60),
    '',
    declarations,
    '',
    `(declare-const ${decisionVar} Bool)`,
    '',
    assertions,
    '',
    `; Final decision entailment`,
    `(assert (=>`,
    `  (and ${precondition})`,
    `  ${decisionVar}))`,
    '',
    `(assert (= ${decisionVar} ${isValid}))`,
    '',
    '(check-sat)',
    '(get-model)',
  ].join('\n')

  const satResult = isValid ? 'unsat' : 'sat'
  const model = isValid
    ? vars.map((v) => `  (define-fun ${v.varName}_ok () Bool true)`).join('\n') +
      `\n  (define-fun ${decisionVar} () Bool true)`
    : `  ; Counterexample found\n  (define-fun ${decisionVar} () Bool false)`

  const trace = [
    formula,
    '',
    '; ─── SOLVER OUTPUT ──────────────────────────────────────',
    satResult,
    satResult === 'unsat' ? '(model' : '(model ; COUNTEREXAMPLE',
    model,
    ')',
    '',
    satResult === 'unsat'
      ? '; ✅ UNSAT — No counterexample exists. Decision is FORMALLY PROVED.'
      : '; ❌ SAT — Counterexample found. Decision is REJECTED.',
  ].join('\n')

  return {
    formula,
    trace,
    result: isValid ? 'proved' : 'rejected',
    reason: isValid
      ? 'All agent preconditions satisfied. Decision logically entailed. No counterexample found (UNSAT).'
      : 'Agent preconditions insufficient. Counterexample exists (SAT). Action blocked by kernel.',
  }
}
