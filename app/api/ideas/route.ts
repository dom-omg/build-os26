export const runtime = 'nodejs'

import Anthropic from '@anthropic-ai/sdk'
import { createHash, generateKeyPairSync } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { IdeaSpec, SignedCert, PipelineEvent } from '@/lib/ideas-types'

const client = new Anthropic()

function encode(event: PipelineEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function extractJSON<T>(text: string): T | null {
  try {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const raw = codeBlock ? codeBlock[1] : text.match(/\{[\s\S]*\}/)?.[0]
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

function loadInbox(): { id: string; content: string }[] {
  const dir = join(process.cwd(), 'data', 'inbox')
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({
        id: f.replace('.md', ''),
        content: readFileSync(join(dir, f), 'utf-8'),
      }))
  } catch {
    return []
  }
}

async function signSpec(spec: IdeaSpec): Promise<SignedCert> {
  const specJson = JSON.stringify(spec)
  const hash = createHash('sha256').update(specJson).digest('hex')

  // Ed25519 — Node.js native
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const { sign: nodeSign, randomBytes } = await import('crypto')
  const sigBuf = nodeSign(null, Buffer.from(specJson), privateKey)
  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' })
  const ed25519PubKeyHex = Buffer.from(pubKeyDer).toString('hex').slice(-64)

  // ML-DSA-65 — NIST FIPS 204 post-quantum (noble/post-quantum)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js')
  const seed = randomBytes(32)
  const { secretKey: mlSk, publicKey: mlPk } = ml_dsa65.keygen(seed)
  const msgBytes = new TextEncoder().encode(specJson)
  const mlSig = ml_dsa65.sign(msgBytes, mlSk)

  return {
    ideaId: spec.id,
    specHash: hash,
    signature: sigBuf.toString('hex').slice(0, 128),
    publicKey: ed25519PubKeyHex,
    algorithm: 'Ed25519 + ML-DSA-65',
    mlDsaPublicKey: Buffer.from(mlPk).toString('hex'),
    mlDsaSignature: Buffer.from(mlSig).toString('hex'),
    timestamp: new Date().toISOString(),
  }
}

export async function POST(req: Request): Promise<Response> {
  const { ideaId, rawContent } = (await req.json()) as { ideaId: string; rawContent?: string }

  const inbox = loadInbox()
  let idea: { id: string; content: string } | undefined

  if (ideaId === '__raw__' && rawContent?.trim()) {
    idea = { id: 'IDEE_RAW', content: rawContent }
  } else if (ideaId === '__random__') {
    idea = inbox[Math.floor(Math.random() * inbox.length)]
  } else {
    idea = inbox.find((i) => i.id === ideaId)
  }

  if (!idea) {
    return new Response('Idea not found', { status: 404 })
  }

  const startedAt = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(encode(event)))
      }

      try {
        // ── Tool 1: read_inbox ──────────────────────────────────
        send({ type: 'step_start', step: 'read_inbox', label: 'Reading founder inbox...' })
        await new Promise((r) => setTimeout(r, 400))

        const titleMatch = idea.content.match(/IDEE BRUTE:\s*\n(.+)/)
        const title = titleMatch ? titleMatch[1].trim().slice(0, 80) : idea.id

        send({ type: 'pipeline_start', ideaId: idea.id, title })
        send({
          type: 'step_done',
          step: 'read_inbox',
          result: `Loaded ${idea.id} — ${idea.content.split('\n').length} lines`,
        })

        // ── Tool 2: elaborate_10q ───────────────────────────────
        send({ type: 'step_start', step: 'elaborate_10q', label: 'Generating 10 elaboration questions...' })

        const elaborateMsg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are an expert product strategist. Given this raw founder idea, generate exactly 10 sharp questions that would transform it into a buildable spec. Cover: problem clarity, market size, competition, tech feasibility, go-to-market, revenue model, risks, unfair advantages, first customer, 90-day MVP scope.

Output JSON: {"questions": ["Q1", "Q2", ..., "Q10"], "title": "short title under 60 chars", "category": "SaaS|Platform|Tool|Agent|Infrastructure", "priority": "high|medium|low", "problemStatement": "1 sentence", "targetMarket": "1 sentence", "estimatedEffort": "X weeks / Y person(s)", "nextAction": "the single most important next step"}

IDEA:
${idea.content}`,
          }],
        })

        const rawElaborate = elaborateMsg.content[0].type === 'text' ? elaborateMsg.content[0].text : ''
        type ElaboratedSpec = {
          questions: string[]
          title: string
          category: string
          priority: 'high' | 'medium' | 'low'
          problemStatement: string
          targetMarket: string
          estimatedEffort: string
          nextAction: string
        }
        let elaborated: ElaboratedSpec | null = extractJSON<ElaboratedSpec>(rawElaborate)

        if (!elaborated) {
          elaborated = {
            questions: ['What is the core problem?', 'Who pays first?', 'What is the MVP scope?'],
            title: title,
            category: 'SaaS',
            priority: 'medium',
            problemStatement: 'Problem requires elaboration.',
            targetMarket: 'SMBs',
            estimatedEffort: '8 weeks / 2 persons',
            nextAction: 'Validate with 3 potential customers',
          }
        }

        send({
          type: 'step_progress',
          step: 'elaborate_10q',
          output: elaborated.questions.slice(0, 3).map((q, i) => `Q${i + 1}: ${q}`).join(' · '),
        })
        send({
          type: 'step_done',
          step: 'elaborate_10q',
          result: `${elaborated.questions.length} questions generated — category: ${elaborated.category} · priority: ${elaborated.priority}`,
        })

        // ── Tool 3: dedup_check ─────────────────────────────────
        send({ type: 'step_start', step: 'dedup_check', label: 'Checking Brain for similar ideas...' })

        const otherIdeasList = inbox
          .filter((i) => i.id !== idea!.id)
          .map((i) => {
            const m = i.content.match(/IDEE BRUTE:\s*\n(.+)/)
            return `${i.id}: ${m ? m[1].trim() : i.id}`
          })

        const otherIdeas = otherIdeasList.join('\n')

        let dedup: { similarity: number; matchId: string | null; verdict: string } = {
          similarity: 0,
          matchId: null,
          verdict: 'new',
        }

        if (otherIdeasList.length > 0) {
          const dedupMsg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `New idea: "${elaborated.title}" — ${elaborated.problemStatement}

Existing ideas:
${otherIdeas}

Output JSON only: {"similarity": 0-100, "matchId": "IDEE_XXX or null", "verdict": "new|related|duplicate"}`,
            }],
          })

          const dedupRaw = dedupMsg.content[0].type === 'text' ? dedupMsg.content[0].text : ''
          dedup = extractJSON<typeof dedup>(dedupRaw) ?? dedup
        }

        const brainStatus: 'new' | 'duplicate' | 'related' =
          dedup.verdict === 'duplicate' ? 'duplicate'
          : dedup.verdict === 'related' ? 'related'
          : 'new'

        if (dedup.similarity >= 70 && dedup.matchId) {
          send({
            type: 'dedup_pivot',
            similarity: dedup.similarity,
            matchId: dedup.matchId,
            action: dedup.similarity >= 85 ? 'merge' : 'continue',
          })
        }

        send({
          type: 'step_done',
          step: 'dedup_check',
          result: `Brain status: ${brainStatus}${dedup.matchId ? ` · closest match: ${dedup.matchId} (${dedup.similarity}% similar)` : ' · no prior match found'}`,
        })

        // ── Tool 4: write_spec ──────────────────────────────────
        send({ type: 'step_start', step: 'write_spec', label: 'Writing structured spec...' })
        await new Promise((r) => setTimeout(r, 300))

        const spec: IdeaSpec = {
          id: idea.id,
          title: elaborated.title,
          rawIdea: idea.content.slice(0, 400),
          category: elaborated.category,
          priority: elaborated.priority,
          problemStatement: elaborated.problemStatement,
          targetMarket: elaborated.targetMarket,
          estimatedEffort: elaborated.estimatedEffort,
          nextAction: elaborated.nextAction,
          questions: elaborated.questions,
          brainStatus,
          brainMatchId: dedup.matchId ?? undefined,
          createdAt: new Date().toISOString(),
        }

        send({ type: 'spec_ready', spec })
        send({
          type: 'step_done',
          step: 'write_spec',
          result: `Spec written — ${elaborated.questions.length} questions · next: ${elaborated.nextAction.slice(0, 60)}`,
        })

        // ── Tool 5: sign_cert ───────────────────────────────────
        send({ type: 'step_start', step: 'sign_cert', label: 'Signing decision certificate...' })
        await new Promise((r) => setTimeout(r, 500))

        const cert = await signSpec(spec)
        send({ type: 'cert_signed', cert })
        send({
          type: 'step_done',
          step: 'sign_cert',
          result: `Ed25519 + ML-DSA-65 dual-signed · hash: ${cert.specHash.slice(0, 16)}...`,
        })

        send({ type: 'pipeline_done', elapsed: Date.now() - startedAt, ideaId: idea.id })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Pipeline error' })
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

export async function GET(): Promise<Response> {
  const inbox = loadInbox()
  return Response.json(inbox.map((i) => {
    const m = i.content.match(/IDEE BRUTE:\s*\n(.+)/)
    const date = i.content.match(/DATE:\s*(.+)/)
    return {
      id: i.id,
      preview: m ? m[1].trim().slice(0, 80) : i.id,
      date: date ? date[1].trim() : '',
    }
  }))
}
