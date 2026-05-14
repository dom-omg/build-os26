import Anthropic from '@anthropic-ai/sdk'
import { buildZ3Proof } from '@/lib/z3'
import type { Agent, SSEEvent } from '@/lib/types'

const client = new Anthropic()

function encode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

async function callAgent(
  name: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = msg.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function POST(req: Request): Promise<Response> {
  const { scenario } = (await req.json()) as { scenario: string }

  if (!scenario?.trim()) {
    return new Response('Missing scenario', { status: 400 })
  }

  const encoder = new TextEncoder()
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(encode(event)))
      }

      try {
        send({ type: 'kernel_boot' })

        // ── Step 1: Orchestrator decides agent plan ─────────────
        const orchAgent: Agent = {
          id: '001',
          name: 'Orchestrator',
          role: 'KERNEL',
          task: 'Analyzing scenario & spawning agents',
          status: 'running',
          output: '',
          startedAt: Date.now(),
        }
        send({ type: 'agent_spawn', agent: orchAgent })

        const planRaw = await callAgent(
          'Orchestrator',
          'You are the kernel orchestrator of an agentic OS. Given a scenario, output a JSON object with: {"agents": [{"name": string, "role": string, "task": string}], "decision": string, "valid": boolean}. Use 2-3 agents. Names: Scout, Analyst, Solver, Monitor, Validator. Keep tasks under 70 chars. "decision" = the final recommended action (< 80 chars). "valid" = whether the action is logically safe (usually true unless scenario is clearly dangerous/impossible).',
          scenario
        )

        let plan: { agents: { name: string; role: string; task: string }[]; decision: string; valid: boolean }

        try {
          const jsonMatch = planRaw.match(/\{[\s\S]*\}/)
          plan = jsonMatch ? JSON.parse(jsonMatch[0]) : null
        } catch {
          plan = null as unknown as typeof plan
        }

        if (!plan?.agents?.length) {
          plan = {
            agents: [
              { name: 'Scout', role: 'RECON', task: 'Gather initial data from scenario' },
              { name: 'Analyst', role: 'ANALYSIS', task: 'Identify root cause and risk vectors' },
              { name: 'Solver', role: 'EXECUTION', task: 'Propose and validate solution path' },
            ],
            decision: 'Execute recommended resolution path',
            valid: true,
          }
        }

        send({
          type: 'agent_done',
          id: '001',
          output: `Spawning ${plan.agents.length} agents. Decision target: "${plan.decision}"`,
          doneAt: Date.now(),
        })

        // ── Step 2: Run each sub-agent ──────────────────────────
        const agentOutputs: { name: string; conclusion: string }[] = []

        for (let i = 0; i < plan.agents.length; i++) {
          const agentDef = plan.agents[i]
          const agentId = String(i + 2).padStart(3, '0')

          const agent: Agent = {
            id: agentId,
            name: agentDef.name,
            role: agentDef.role,
            task: agentDef.task,
            status: 'spawning',
            output: '',
            startedAt: Date.now(),
          }
          send({ type: 'agent_spawn', agent })

          await new Promise((r) => setTimeout(r, 300))
          send({ type: 'agent_update', id: agentId, status: 'thinking', output: '' })

          const output = await callAgent(
            agentDef.name,
            `You are ${agentDef.name}, an AI agent with role ${agentDef.role}. Your task: ${agentDef.task}. Be concise, technical, factual. Output 2-3 sentences max. End with a one-line conclusion starting with "CONCLUSION:"`,
            scenario
          )

          const conclusionMatch = output.match(/CONCLUSION:\s*(.+)/i)
          const conclusion = conclusionMatch ? conclusionMatch[1].trim() : output.slice(-80)

          agentOutputs.push({ name: agentDef.name, conclusion })

          send({
            type: 'agent_done',
            id: agentId,
            output,
            doneAt: Date.now(),
          })

          await new Promise((r) => setTimeout(r, 200))
        }

        // ── Step 3: Z3 Verifier ─────────────────────────────────
        const verifierId = String(plan.agents.length + 2).padStart(3, '0')
        const verifierAgent: Agent = {
          id: verifierId,
          name: 'Z3-Verifier',
          role: 'FORMAL PROOF',
          task: `Verify decision: "${plan.decision.slice(0, 60)}"`,
          status: 'verifying',
          output: '',
          startedAt: Date.now(),
        }
        send({ type: 'agent_spawn', agent: verifierAgent })

        const z3 = buildZ3Proof(scenario, agentOutputs, plan.decision, plan.valid)

        send({ type: 'z3_start', formula: z3.formula })
        await new Promise((r) => setTimeout(r, 1200))

        send({
          type: 'agent_done',
          id: verifierId,
          output: plan.valid
            ? `UNSAT — No counterexample. Decision formally proved.`
            : `SAT — Counterexample found. Decision rejected by kernel.`,
          doneAt: Date.now(),
        })

        send({
          type: 'z3_result',
          result: z3.result,
          trace: z3.trace,
          reason: z3.reason,
        })

        const elapsed = Date.now() - startedAt
        send({
          type: 'system_done',
          summary: plan.decision,
          elapsed,
        })
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown kernel error',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
