/**
 * Génère un JSON d’alertes dynamiques, aligné sur normalizeAlert (src/store/soc.js).
 *
 * Usage : npm run generate:alerts -- 12
 *
 * Un seul argument : le nombre d’alertes (1–20, défaut 10).
 * Sévérité et score suivent le type ; source ∈ GuardDuty | WAF | SIEM.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_COUNT = 20
const DEFAULT_COUNT = 10

const SCHEMA = {
  version: '3.2-dynamic',
  required: ['id', 'severity', 'source', 'type', 'asset'],
  optional: ['resourceType', 'region', 'score', 'ip', 'star', 'receivedAt'],
  severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  source: ['GuardDuty', 'WAF', 'SIEM'],
}

const SCORE_BAND = {
  CRITICAL: [85, 98],
  HIGH: [68, 84],
  MEDIUM: [35, 62],
  LOW: [6, 28],
}

const ASSETS = {
  EC2: ['i-0payfront', 'bastion-prod', 'i-07batch', 'i-0a12ec2pay', 'i-04devbox', 'i-09scanlab'],
  ELB: ['nlb-payments', 'alb-checkout'],
  Lambda: ['lambda-health', 'lambda-notify'],
  S3: ['s3://checkout-logs', 's3://checkout-receipts'],
  'API Gateway': ['api-checkout', 'login-checkout', 'api-webhooks'],
  CloudFront: ['cdn-edge', 'cdn-static'],
  IAM: ['role/checkout-api', 'role/checkout-admin', 'user/cfo-finance', 'user/ops-oncall'],
}

const FINDINGS = {
  GuardDuty: [
    { type: 'UnauthorizedAPICall', resourceType: 'EC2', severity: 'CRITICAL' },
    { type: 'CryptoCurrencyMining', resourceType: 'EC2', severity: 'CRITICAL' },
    { type: 'ExfiltrationS3', resourceType: 'S3', severity: 'HIGH' },
    { type: 'SSHBruteForce', resourceType: 'EC2', severity: 'HIGH' },
    { type: 'StealthIPCaller', resourceType: 'EC2', severity: 'HIGH' },
    { type: 'PortProbe', resourceType: 'EC2', severity: 'MEDIUM' },
    { type: 'ReconPortProbe', resourceType: 'EC2', severity: 'LOW' },
    { type: 'HealthCheckProbe', resourceType: 'ELB', severity: 'LOW' },
    { type: 'AuthorizedAPICall', resourceType: 'Lambda', severity: 'LOW' },
  ],
  WAF: [
    { type: 'CredentialStuffing', resourceType: 'API Gateway', severity: 'HIGH' },
    { type: 'SqlInjectionAttempt', resourceType: 'API Gateway', severity: 'HIGH' },
    { type: 'RateLimitBurst', resourceType: 'API Gateway', severity: 'MEDIUM' },
    { type: 'ScannerUserAgent', resourceType: 'CloudFront', severity: 'LOW' },
    { type: 'BotScoreAnomaly', resourceType: 'CloudFront', severity: 'LOW' },
  ],
  SIEM: [
    { type: 'PrivilegeEscalation', resourceType: 'IAM', severity: 'CRITICAL' },
    { type: 'ImpossibleTravel', resourceType: 'IAM', severity: 'HIGH' },
    { type: 'IAMKeyAnomaly', resourceType: 'IAM', severity: 'HIGH' },
    { type: 'FailedMfaBurst', resourceType: 'IAM', severity: 'MEDIUM' },
    { type: 'OffHoursLogin', resourceType: 'IAM', severity: 'LOW' },
  ],
}

const PREFIX = { GuardDuty: 'GD', WAF: 'WAF', SIEM: 'SIEM' }
const REGION = 'eu-west-1'

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function scoreFor(severity, rng) {
  const [min, max] = SCORE_BAND[severity]
  return min + Math.floor(rng() * (max - min + 1))
}

function randomIp(rng) {
  return `${1 + Math.floor(rng() * 223)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}.${1 + Math.floor(rng() * 254)}`
}

function clock(index) {
  const base = Date.UTC(2026, 8, 7, 12, 32, 0)
  return new Date(base - index * 17 * 1000).toLocaleTimeString('fr-FR', {
    hour12: false,
    timeZone: 'UTC',
  })
}

function pool(sources) {
  return sources.flatMap((source) =>
    FINDINGS[source].map((finding) => ({ source, ...finding })),
  )
}

function shuffle(rng, items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function sampleFindings(rng, sources, count) {
  const catalog = pool(sources)
  const shuffled = shuffle(rng, catalog)
  const picked = []
  for (let i = 0; i < count; i += 1) {
    picked.push(shuffled[i % shuffled.length])
  }
  return picked
}

function buildAlert(finding, index, rng, seq) {
  const assets = ASSETS[finding.resourceType] || ['unknown']
  return {
    id: `${PREFIX[finding.source]}-${9000 + seq}`,
    severity: finding.severity,
    source: finding.source,
    type: finding.type,
    asset: pick(rng, assets),
    resourceType: finding.resourceType,
    region: REGION,
    score: scoreFor(finding.severity, rng),
    ip: randomIp(rng),
    receivedAt: clock(index),
  }
}

function parseCount(argv) {
  if (argv.length === 0) return DEFAULT_COUNT
  if (argv.length === 1 && /^\d+$/.test(argv[0])) return clampCount(argv[0])
  throw new Error('Usage : npm run generate:alerts -- [count]')
}

function clampCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_COUNT
  return Math.min(MAX_COUNT, Math.max(1, Math.trunc(n)))
}

function markStar(alerts) {
  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  const top = [...alerts].sort((a, b) => {
    const gap = rank[b.severity] - rank[a.severity]
    return gap !== 0 ? gap : b.score - a.score
  })[0]
  if (top) top.star = true
}

function document() {
  const count = parseCount(process.argv.slice(2))
  const seed = Date.now() >>> 0
  const rng = mulberry32(seed)
  const findings = sampleFindings(rng, SCHEMA.source, count)
  const seqBySource = { GuardDuty: 0, WAF: 0, SIEM: 0 }
  const alerts = findings.map((finding, index) => {
    const seq = seqBySource[finding.source]
    seqBySource[finding.source] += 1
    return buildAlert(finding, index, rng, seq)
  })
  markStar(alerts)

  const out = 'public/data/alerts.generated.json'
  const doc = {
    meta: {
      product: 'Smart Agentic SOC',
      org: 'Checkout SAS',
      environment: 'prod',
      region: 'eu-west-1',
      llm: 'Amazon Bedrock',
      schemaVersion: SCHEMA.version,
      generatedAt: new Date().toISOString(),
      count,
      fields: [...SCHEMA.required, ...SCHEMA.optional],
    },
    alerts,
  }

  const outPath = resolve(root, out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`)

  const mix = SCHEMA.severity
    .map((sev) => `${sev}:${alerts.filter((a) => a.severity === sev).length}`)
    .join(' ')
  process.stdout.write(`Écrit ${alerts.length} alertes → ${out}\n${mix}\n`)
}

document()
