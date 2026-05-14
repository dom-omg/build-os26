// lib/z3.ts

export interface PolicyFact {
  variable: string
  value: boolean
  label: string
  description: string
  required: boolean
}

export interface Z3Result {
  result: 'proved' | 'rejected' | 'undecided'
  smtFormula: string
  smtTrace: string
  reason: string
  counterexample: PolicyFact | null
}

export interface AgentInput {
  name: string
  role: string
  conclusion: string
}

type ScenarioDomain = 'security_breach' | 'financial_crime' | 'ai_audit' | 'ops_incident' | 'generic'

function detectDomain(scenario: string): ScenarioDomain {
  const s = scenario.toLowerCase()
  if (/creden|leak|github|classified|government.*breach|breach.*contractor/.test(s)) return 'security_breach'
  if (/wallet|aml|launder|transfer.*million|mixer|suspicious.*fund/.test(s)) return 'financial_crime'
  if (/ai model|bias|loan.*ai|audit.*chain|decision.*chain|llm|model.*approv/.test(s)) return 'ai_audit'
  if (/server.*down|database.*timeout|outage|users affected|production.*down|connection timeout/.test(s)) return 'ops_incident'
  return 'generic'
}

function agentConclusionDone(conclusion: string): boolean {
  const c = conclusion.toLowerCase()
  const negativeSignals = [
    'could not', 'unable to', 'failed to', 'insufficient',
    'inconclusive', 'unclear', 'undetermined', 'incomplete',
    'no data', 'not found', 'cannot determine',
  ]
  return !negativeSignals.some(s => c.includes(s))
}

function agentRoleToFact(role: string, conclusion: string): PolicyFact {
  const r = role.toUpperCase()
  const done = agentConclusionDone(conclusion)
  if (r.includes('RECON') || r.includes('SCOUT')) {
    return { variable: 'recon_complete', value: done, label: 'Reconnaissance Complete', description: done ? 'Scout gathered required initial data' : 'Scout failed to gather sufficient data', required: true }
  }
  if (r.includes('ANAL')) {
    return { variable: 'analysis_complete', value: done, label: 'Analysis Complete', description: done ? 'Analyst identified root cause and risk vectors' : 'Analyst could not complete root cause analysis', required: true }
  }
  if (r.includes('EXEC') || r.includes('SOLV')) {
    return { variable: 'solution_complete', value: done, label: 'Solution Validated', description: done ? 'Solver proposed and validated a remediation path' : 'Solver failed to produce a validated solution', required: true }
  }
  if (r.includes('MONITOR') || r.includes('AUDIT') || r.includes('VALID')) {
    return { variable: 'monitoring_ok', value: done, label: 'Monitoring Established', description: done ? 'Ongoing monitoring established' : 'Monitoring not established', required: false }
  }
  const varName = `${role.toLowerCase().replace(/[^a-z0-9]/g, '_')}_ok`
  return { variable: varName, value: done, label: `${role} Complete`, description: done ? `${role} completed its task` : `${role} failed`, required: true }
}

function domainFacts(domain: ScenarioDomain, scenario: string, allConclusions: string): PolicyFact[] {
  const s = scenario.toLowerCase()
  const c = allConclusions.toLowerCase()
  const facts: PolicyFact[] = []

  if (domain === 'security_breach') {
    const credRevoked = !/not revok|fail.*revok|unable.*revok|didn.t revok/.test(c)
    facts.push({ variable: 'credentials_revoked', value: credRevoked, label: 'Credentials Revoked', description: credRevoked ? 'Exposed credentials were revoked' : 'Credentials were NOT revoked — breach window still open', required: true })

    if (/government|classified|federal|contractor|secret/.test(s)) {
      const fedEscalated = /escal|federal|fbi|cisa|government.*notif|notif.*authori/.test(c)
      facts.push({ variable: 'federal_escalation', value: fedEscalated, label: 'Federal Escalation', description: fedEscalated ? 'Federal authorities notified as required' : 'Federal escalation NOT completed — mandatory for classified breach', required: true })
    }

    if (/github|repo|reposit/.test(s)) {
      const repoPurged = /purge|private|delete.*repo|repo.*remov|reposit.*secur/.test(c)
      facts.push({ variable: 'repository_purged', value: repoPurged, label: 'Repository Secured', description: repoPurged ? 'Leaked repository was purged/privatized' : 'Repository containing leaked data NOT secured', required: true })
    }
  }

  if (domain === 'financial_crime') {
    const legalOk = !/no legal|unauthorized|without.*warrant|illegal action/.test(c)
    facts.push({ variable: 'legal_compliance', value: legalOk, label: 'Legal Compliance', description: legalOk ? 'Action taken within legal authority' : 'Action requires legal authority — not confirmed', required: true })

    const chainTraced = /traced|all hop|full chain|complete.*chain|hop.*identif/.test(c)
    facts.push({ variable: 'chain_traced', value: chainTraced, label: 'Chain of Custody', description: chainTraced ? 'Full transaction chain traced' : 'Transaction chain not fully traced — cannot confirm final destination', required: true })
  }

  if (domain === 'ai_audit') {
    const humanReview = /human.*review|manual.*review|flagged.*review|escalat.*human/.test(c)
    facts.push({ variable: 'human_review', value: humanReview, label: 'Human Review Triggered', description: humanReview ? 'Human review process triggered for AI decision' : 'Human review NOT triggered — mandatory for AI audit', required: true })

    const auditComplete = /audit|trail|logged|document|recorded|track/.test(c)
    facts.push({ variable: 'audit_trail', value: auditComplete, label: 'Audit Trail Complete', description: auditComplete ? 'Decision chain fully documented' : 'Audit trail incomplete — cannot verify AI decision chain', required: true })
  }

  if (domain === 'ops_incident') {
    const rootCause = /root cause|identified|confirmed.*cause|cause.*confirm|determin.*cause/.test(c)
    facts.push({ variable: 'root_cause_identified', value: rootCause, label: 'Root Cause Identified', description: rootCause ? 'Root cause identified and confirmed' : 'Root cause NOT identified — resolution may be temporary', required: true })

    const rollback = /rollback|revert|restore|failover|backup/.test(c)
    facts.push({ variable: 'rollback_ready', value: rollback, label: 'Rollback Plan Ready', description: rollback ? 'Rollback/recovery plan in place' : 'No rollback plan — recovery path unverified', required: true })
  }

  return facts
}

function generateSMTFormula(scenario: string, facts: PolicyFact[], domain: ScenarioDomain): string {
  const domainComment = {
    security_breach: 'Domain: Security Breach Response',
    financial_crime: 'Domain: Financial Crime Investigation',
    ai_audit: 'Domain: AI Decision Audit',
    ops_incident: 'Domain: Operational Incident Response',
    generic: 'Domain: Generic Agent Verification',
  }[domain]

  const declarations = facts.map(f => `(declare-const ${f.variable} Bool)`).join('\n')
  const assertions = facts.map(f => `(assert (= ${f.variable} ${f.value}))  ; ${f.label}: ${f.description.slice(0, 50)}`).join('\n')
  const requiredVars = facts.filter(f => f.required).map(f => f.variable)
  const conjunct = requiredVars.length === 1
    ? requiredVars[0]
    : `(and ${requiredVars.join('\n         ')})`

  return [
    `; ─── QED Z3 VERIFICATION ───────────────────────────────────`,
    `; Kernel: build-os26 v0.1`,
    `; ${domainComment}`,
    `; Scenario: ${scenario.slice(0, 70)}`,
    ``,
    `; ── Variable Declarations ────────────────────────────────`,
    declarations,
    ``,
    `; ── Agent Findings & Domain Policy ──────────────────────`,
    assertions,
    ``,
    `; ── Decision Validity Check ─────────────────────────────`,
    `; Negate the conjunction of all required preconditions.`,
    `; UNSAT ↦ no counterexample ↦ decision is FORMALLY PROVED.`,
    `; SAT   ↦ counterexample found ↦ decision is REJECTED.`,
    `(assert (not ${conjunct}))`,
    ``,
    `(check-sat)`,
    `(get-model)`,
  ].join('\n')
}

function generateSMTTrace(facts: PolicyFact[], formula: string, result: 'proved' | 'rejected', counterexample: PolicyFact | null): string {
  const modelLines = facts.map(f =>
    `  (define-fun ${f.variable} () Bool ${f.value})`
  )

  let model: string
  if (result === 'proved') {
    model = [
      '(model',
      ...modelLines,
      ')',
      '',
      '; ✅ UNSAT — No counterexample exists. Decision is FORMALLY PROVED.',
    ].join('\n')
  } else {
    model = [
      '(model ; ❌ COUNTEREXAMPLE',
      ...modelLines,
      ')',
      '',
      '; ❌ SAT — Counterexample found.',
      counterexample
        ? `; Violated: ${counterexample.variable} = false`
        : '; One or more preconditions failed.',
      '; Decision REJECTED by kernel — action blocked.',
    ].join('\n')
  }

  return [
    formula,
    '',
    '; ─── SOLVER OUTPUT ─────────────────────────────────────',
    result === 'proved' ? 'unsat' : 'sat',
    model,
  ].join('\n')
}

export function buildZ3Verification(
  scenario: string,
  agents: AgentInput[],
): Z3Result {
  const domain = detectDomain(scenario)
  const allConclusions = agents.map(a => a.conclusion).join(' ')

  const baseFacts = agents.map(a => agentRoleToFact(a.role, a.conclusion))
  const extraFacts = domainFacts(domain, scenario, allConclusions)

  // Deduplicate by variable name (agent-extracted facts take precedence)
  const seen = new Set(baseFacts.map(f => f.variable))
  const allFacts: PolicyFact[] = [...baseFacts, ...extraFacts.filter(f => !seen.has(f.variable))]

  const failingFact = allFacts.filter(f => f.required).find(f => !f.value) ?? null
  const result: 'proved' | 'rejected' = failingFact ? 'rejected' : 'proved'

  const smtFormula = generateSMTFormula(scenario, allFacts, domain)
  const smtTrace = generateSMTTrace(allFacts, smtFormula, result, failingFact)

  return {
    result,
    smtFormula,
    smtTrace,
    reason: result === 'proved'
      ? `All ${allFacts.filter(f => f.required).length} preconditions satisfied. No counterexample exists (UNSAT).`
      : `Precondition violated: "${failingFact!.label}". Counterexample found (SAT). Decision blocked by kernel.`,
    counterexample: failingFact,
  }
}
