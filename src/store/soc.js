import { computed, reactive } from 'vue'
import alertsDoc from '../data/alerts.json'
import { lookupCmdb } from '../data/cmdb'
import { bandFromScore } from '../data/architecture'
import { generateAlert, resetLiveSeq } from '../data/generator'
import { SEV_LABEL } from '../labels'

const AGENT_DEFS = [
  { id: 'scheduler', n: 'A4', label: 'Orchestrate', task: 'Ingestion du flux' },
  { id: 'extract', n: 'A1', label: 'Extract', task: 'IP · agent · ressource' },
  { id: 'intel', n: 'A2', label: 'Analyze', task: 'type · gravité · ressource' },
  { id: 'llm', n: 'A2b', label: 'Analyze LLM', task: 'Verdict masqué' },
  { id: 'notify', n: 'A3', label: 'Notify', task: 'Ticket L2 · envoi' },
]

const SOURCE_MAP = {
  Tous: null,
  GuardDuty: 'GuardDuty',
  WAF: 'WAF',
  SIEM: 'SIEM',
}

let snapshot = null
let logSeq = 0
let clockTimer = null
let ingestTimer = null
let batchIds = new Set()
const liveTreatTimers = new Set()

const MAX_ALERTS = 36
const INGEST_FIRST_MS = 1500
const INGEST_MIN_MS = 10000
const INGEST_MAX_MS = 16000
const FRESH_MS = 22000
const LIVE_TREAT_MS = 2000

export const soc = reactive({
  loaded: false,
  error: '',
  running: false,
  stopped: false,
  launched: false,
  autopilot: false,
  clock: '--:--:--',
  meta: {},
  kpis: {},
  alerts: [],
  cases: {},
  agents: AGENT_DEFS.map((a) => ({ ...a, status: 'IDLE' })),
  currentAgentId: '',
  config: {
    source: 'Tous',
    maskPii: true,
    autoRemediate: false,
  },
  dashSlice: null,
  sentTickets: [],
  logs: [],
  loggedIn: false,
  loginBusy: false,
  bootstrapping: false,
  bootLabel: '',
  ingestOn: false,
  lastArrival: null,
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function hydrateCase(entry) {
  const item = clone(entry)
  item.hitl = 'idle'
  item.played = false
  item.playing = false
  item.sent = false
  item.steps = (item.steps || []).map((step) => ({
    ...step,
    status: 'queued',
  }))
  return item
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', { hour12: false })
}

export function pushLog(agent, message, level = 'info', kind = '') {
  soc.logs.unshift({
    id: ++logSeq,
    time: soc.clock === '--:--:--' ? formatClock() : soc.clock,
    agent,
    message,
    level,
    kind: kind || (level === 'warn' ? 'warn' : 'info'),
  })
  if (soc.logs.length > 80) soc.logs.pop()
}

export function startClock() {
  if (clockTimer) return
  const tick = () => {
    soc.clock = formatClock()
  }
  tick()
  clockTimer = setInterval(tick, 1000)
}

function ingestDelay() {
  return INGEST_MIN_MS + Math.floor(Math.random() * (INGEST_MAX_MS - INGEST_MIN_MS))
}

function ingestOne() {
  if (!soc.loggedIn || !soc.ingestOn || soc.alerts.length >= MAX_ALERTS) return
  const alert = normalizeAlert(generateAlert())
  const now = Date.now()
  alert.live = true
  alert.fresh = true
  alert.receivedAtMs = now
  alert.receivedAt = formatClock(new Date(now))
  alert.agentLabel = soc.autopilot ? 'Traitement…' : 'En attente'
  soc.cases[alert.caseId] = hydrateCase(stubCase(alert))
  soc.alerts.unshift(alert)
  soc.lastArrival = {
    id: alert.id,
    severity: alert.severity,
    source: alert.source,
    asset: alert.asset,
    at: alert.receivedAt,
  }
  pushLog(
    'scheduler',
    `Arrivée · ${alert.id} · ${SEV_LABEL[alert.severity]} · ${alert.source} · ${alert.asset}`,
    'ok',
    'arrival',
  )
  if (soc.autopilot && !soc.stopped) scheduleLiveTreat(alert)
  window.setTimeout(() => {
    if (alert.fresh) alert.fresh = false
  }, FRESH_MS)
}

function scheduleIngest(delay) {
  if (ingestTimer) window.clearTimeout(ingestTimer)
  ingestTimer = window.setTimeout(() => {
    ingestOne()
    if (soc.ingestOn) scheduleIngest(ingestDelay())
  }, delay)
}

export function startIngest() {
  if (!soc.loggedIn) return
  soc.ingestOn = true
  if (ingestTimer) return
  scheduleIngest(INGEST_FIRST_MS)
}

export function stopIngest() {
  soc.ingestOn = false
  if (ingestTimer) {
    window.clearTimeout(ingestTimer)
    ingestTimer = null
  }
}

export function loadData() {
  if (soc.loaded) return
  const alerts = (alertsDoc.alerts || []).map(normalizeAlert)
  stampArrivals(alerts)
  snapshot = {
    meta: clone(alertsDoc.meta || {}),
    kpis: clone(alertsDoc.kpis || {}),
    alerts,
    cases: casesFromAlerts(alerts),
  }
  applySnapshot()
  soc.loaded = true
  pushLog('scheduler', `Démarrage · ${alerts.length} alertes en file`, 'ok')
}

function applySnapshot() {
  if (!snapshot) return
  soc.meta = clone(snapshot.meta)
  soc.kpis = clone(snapshot.kpis)
  soc.alerts = clone(snapshot.alerts)
  soc.cases = Object.fromEntries(
    Object.entries(snapshot.cases).map(([id, value]) => [id, hydrateCase(value)]),
  )
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setAgent(id, status) {
  if (status === 'RUN' || status === 'WAIT') {
    soc.agents.forEach((agent) => {
      if (agent.id !== id && (agent.status === 'RUN' || agent.status === 'WAIT')) {
        agent.status = 'OK'
      }
    })
    soc.currentAgentId = id
  }
  const agent = soc.agents.find((item) => item.id === id)
  if (agent) agent.status = status
  if (status !== 'RUN' && status !== 'WAIT' && soc.currentAgentId === id) {
    soc.currentAgentId = ''
  }
}

export const currentAgent = computed(
  () => soc.agents.find((agent) => agent.id === soc.currentAgentId) || null,
)

export const queuedAlerts = computed(() => {
  const source = SOURCE_MAP[soc.config.source]
  if (!source) return soc.alerts
  return soc.alerts.filter((alert) => alert.source === source)
})

const DONE_STATUSES = ['ignored', 'false_positive', 'closed', 'escalated']

export const LIST_LIMIT = 8

export function clearDashSlice() {
  soc.dashSlice = null
}

export function toggleDashSlice(widgetId, key) {
  if (!widgetId || !key) return
  if (soc.dashSlice?.widgetId === widgetId && soc.dashSlice?.key === key) {
    soc.dashSlice = null
    return
  }
  soc.dashSlice = { widgetId, key }
}

function sortQueue(alerts) {
  return [...alerts].sort((a, b) => (b.receivedAtMs || 0) - (a.receivedAtMs || 0))
}

function sourceWidget(alerts) {
  const sources = {}
  alerts.forEach((alert) => {
    sources[alert.source] = (sources[alert.source] || 0) + 1
  })
  return {
    id: 'source',
    type: 'pie',
    label: 'File',
    value: String(alerts.length),
    slices: [
      { key: 'all', label: 'Tous', n: alerts.length, color: '#bbbbbb', skipPie: true },
      { key: 'GuardDuty', label: 'GuardDuty', n: sources.GuardDuty || 0, color: '#00dfff' },
      { key: 'WAF', label: 'WAF', n: sources.WAF || 0, color: '#3a00f9' },
      { key: 'SIEM', label: 'SIEM', n: sources.SIEM || 0, color: '#15fd00' },
    ],
  }
}

function severityWidget(alerts) {
  const sevs = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  alerts.forEach((alert) => {
    sevs[alert.severity] = (sevs[alert.severity] || 0) + 1
  })
  return {
    id: 'severity',
    type: 'pie',
    label: 'Gravité',
    value: String(alerts.length),
    slices: [
      { key: 'CRITICAL', label: SEV_LABEL.CRITICAL, n: sevs.CRITICAL, color: '#ef4444' },
      { key: 'HIGH', label: SEV_LABEL.HIGH, n: sevs.HIGH, color: '#f97316' },
      { key: 'MEDIUM', label: SEV_LABEL.MEDIUM, n: sevs.MEDIUM, color: '#eab308' },
      { key: 'LOW', label: SEV_LABEL.LOW, n: sevs.LOW, color: '#9ca3af' },
    ],
  }
}

function scoreWidget(alerts) {
  const bands = { watch: 0, p2: 0, p1: 0 }
  alerts.forEach((alert) => {
    bands[bandFromScore(alert.score).id] += 1
  })
  return {
    id: 'score',
    type: 'pie',
    label: 'Priorité A2',
    value: String(bands.p1 + bands.p2),
    defaultKey: 'p1',
    slices: [
      { key: 'p1', label: 'P1', n: bands.p1, color: '#ef4444' },
      { key: 'p2', label: 'P2', n: bands.p2, color: '#f97316' },
      { key: 'watch', label: 'Surveillance', n: bands.watch, color: '#9ca3af' },
    ],
  }
}

function isDoneAlert(alert) {
  if (DONE_STATUSES.includes(alert.status)) return true
  return Boolean(soc.cases[alert.caseId]?.sent)
}

function treatWidget(alerts) {
  const total = alerts.length
  const done = alerts.filter(isDoneAlert).length
  const todo = Math.max(total - done, 0)
  const pct = total ? Math.round((done / total) * 100) : 0
  return {
    id: 'treat',
    type: 'pie',
    label: 'Traitement',
    value: `${pct}%`,
    defaultKey: 'done',
    slices: [
      { key: 'done', label: 'Traitées', n: done, color: '#15fd00' },
      { key: 'todo', label: 'En file', n: todo, color: '#00dfff' },
    ],
  }
}
function matchesDashSlice(alert, slice) {
  if (!slice) return true
  const { widgetId, key } = slice
  if (widgetId === 'source') return alert.source === key
  if (widgetId === 'severity') return alert.severity === key
  if (widgetId === 'score') return bandFromScore(alert.score).id === key
  if (widgetId === 'treat') return key === 'done' ? isDoneAlert(alert) : !isDoneAlert(alert)
  return true
}

export const dashboardWidgets = computed(() => {
  const alerts = queuedAlerts.value
  return [sourceWidget(alerts), severityWidget(alerts), scoreWidget(alerts), treatWidget(alerts)]
})

export const drillAlerts = computed(() =>
  sortQueue(queuedAlerts.value.filter((alert) => matchesDashSlice(alert, soc.dashSlice))),
)

function visibleHint(n) {
  return `Aperçu ${Math.min(LIST_LIMIT, n)} sur ${n}`
}

export const dashTableMeta = computed(() => {
  const n = drillAlerts.value.length
  const slice = soc.dashSlice
  if (slice) {
    const widget = dashboardWidgets.value.find((item) => item.id === slice.widgetId)
    const part =
      widget?.slices?.find((item) => item.key === slice.key)
    const name = part?.label || slice.key
    return {
      title: `${widget?.label || 'Filtre'} · ${name}`,
      hint: `${visibleHint(n)} · cas derrière le chiffre.`,
      count: n,
    }
  }
  return {
    title: 'File',
    hint: `${visibleHint(n)} dans le périmètre. Clic widget pour filtrer.`,
    count: n,
  }
})

function clearLiveTreats() {
  liveTreatTimers.forEach((id) => clearTimeout(id))
  liveTreatTimers.clear()
}

function scheduleLiveTreat(alert) {
  const id = window.setTimeout(() => {
    liveTreatTimers.delete(id)
    treatLiveAlert(alert)
  }, LIVE_TREAT_MS)
  liveTreatTimers.add(id)
}

function treatLiveAlert(alert) {
  if (!alert || soc.stopped || !soc.autopilot) return
  if (DONE_STATUSES.includes(alert.status)) return
  if (batchIds.has(alert.id)) return
  const outcome = classifyAlert(alert)
  if (outcome === 'ready') confirmL2Send(alert.caseId)
  sealCase(alert)
  pushLog('notify', `${alert.id} · traité en 2 s · ${alert.agentLabel}`, 'ok', 'treat')
}

function stampTreated(alert, status, label) {
  if (!alert) return
  alert.status = status
  if (label) alert.agentLabel = label
  alert.treatedAtMs = Date.now()
}

function classifyAlert(alert) {
  if (DONE_STATUSES.includes(alert.status)) return alert.status
  const item = soc.cases[alert.caseId]
  if (!item) {
    stampTreated(alert, 'ignored', 'Sans dossier')
    return 'ignored'
  }
  if (alert.severity === 'LOW') {
    stampTreated(alert, 'ignored', 'Ignoré L1')
    return 'ignored'
  }
  if (!item.ticket) {
    stampTreated(alert, 'false_positive', 'FP classé')
    return 'false_positive'
  }
  alert.status = 'ready'
  alert.agentLabel = 'Dossier prêt'
  return 'ready'
}

function intelHint(alert) {
  const item = soc.cases[alert.caseId]
  const hits = item?.intel?.hits || []
  if (hits.length) return hits[0]
  const keyword = item?.intel?.keywords?.[0] || alert.type
  return keyword ? `mot-clé ${keyword}` : 'analyse de l’alerte'
}

function scanFromAlert(alert) {
  const escalate = alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
  return {
    hits: escalate ? [`${alert.severity} · ${alert.asset}`] : [],
    keywords: [alert.type, alert.source].filter(Boolean),
  }
}

const FINDING_READ = {
  UnauthorizedAPICall: 'Appel API non autorisé sur une ressource sensible. Compromission de rôle ou de clé possible.',
  SSHBruteForce: 'Rafale d’authentifications SSH. Accès forcé vers un bastion, ou scan opportuniste.',
  CryptoCurrencyMining: 'Charge CPU / processus de minage. Instance potentiellement détournée.',
  ExfiltrationS3: 'Lecture anormale d’un bucket. Fuite de données possible.',
  PortProbe: 'Balayage de ports. Reconnaissance, souvent sans exploitation.',
  HealthCheckProbe: 'Sondes répétées vers un équilibreur. Trafic de santé ou scanner.',
  CredentialStuffing: 'Tentatives de login en masse. Compromission de comptes applicatifs possible.',
  SqlInjectionAttempt: 'Payloads d’injection SQL sur une API. Tentative d’accès aux données.',
  RateLimitBurst: 'Pic de requêtes au-delà du quota. Bot, test de charge ou déni de service léger.',
  ScannerUserAgent: 'User-agent de scanner sur le CDN. Reconnaissance Internet, souvent sans impact.',
  PrivilegeEscalation: 'Élévation de privilèges IAM. Compte interne potentiellement abusé.',
  ImpossibleTravel: 'Connexions incompatibles géographiquement. Compte volé ou VPN légitime.',
  FailedMfaBurst: 'Échecs MFA répétés. Stuffing ou utilisateur bloqué.',
  OffHoursLogin: 'Connexion hors horaires. Astreinte légitime ou compte détourné.',
}

const DIAG_HINT = {
  CRITICAL: 'Piste automatique : escalade L2. Isolation recommandée, non exécutée.',
  HIGH: 'Piste automatique : escalade L2. L1 confirme, traite ou recale.',
  MEDIUM: 'Piste automatique : traitement L1 ou faux positif. Escalade seulement si le contexte l’exige.',
  LOW: 'Piste automatique : bruit probable. Traitement L1 ou faux positif.',
}

function buildDiagnostic(alert) {
  const high = alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
  return {
    reading:
      FINDING_READ[alert.type] ||
      `Finding ${alert.type} sur ${alert.asset} (${alert.source}).`,
    hint: DIAG_HINT[alert.severity] || DIAG_HINT.MEDIUM,
    suggested: high ? 'escalade' : alert.severity === 'LOW' ? 'fp' : 'l1',
  }
}

function makeTicket(alert) {
  const ticketId = alert.ticketId || `SOC-L2-${alert.id}`
  alert.ticketId = ticketId
  const band = bandFromScore(alert.score)
  return {
    id: ticketId,
    priority: band.ticket || 'P3',
    to: 'analystes.l2@checkout.internal',
    subject: `[${band.label}] ${alert.type} ${alert.asset}`,
    summary: `Alerte ${alert.id} (${alert.source}). Score ${alert.score} (${band.range}). Isolation recommandee, non executee.`,
    actions: [
      'Isoler le groupe de sécurité (validation L2)',
      'Instantané disque si instance',
      'Vérifier CloudTrail sur 24 h',
    ],
  }
}

export function isL1Locked(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.sent) return true
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  return Boolean(alert && DONE_STATUSES.includes(alert.status))
}

function maskIp(ip) {
  if (!ip || ip === 'n/a') return ip || 'n/a'
  const parts = String(ip).split('.')
  if (parts.length === 4) return `${parts[0]}.x.x.x`
  if (String(ip).length > 6) return `${String(ip).slice(0, 3)}…`
  return 'x.x.x.x'
}

function maskId(value) {
  const text = String(value || 'n/a')
  if (text === 'n/a' || text.length < 6) return text
  return `${text.slice(0, 2)}****${text.slice(-3)}`
}

function normalizeAlert(raw, index) {
  const id = raw.id || `ALT-${index + 1}`
  return {
    id,
    caseId: raw.caseId || `INC-${id}`,
    ticketId: raw.ticketId ?? null,
    severity: raw.severity || 'MEDIUM',
    source: raw.source || 'GuardDuty',
    type: raw.type || raw.findingType || 'Inconnu',
    asset: raw.asset || raw.resource || 'inconnu',
    resourceType: raw.resourceType || 'EC2',
    region: raw.region || 'eu-west-1',
    score: Number.isFinite(raw.score) ? raw.score : 50,
    status: 'new',
    agentLabel: 'En attente',
    receivedAt: formatClock(),
    receivedAtMs: Date.now(),
    star: Boolean(raw.star),
    live: Boolean(raw.live),
    treatedAtMs: 0,
    ip: raw.ip || raw.sourceIp || null,
    cmdb: lookupCmdb(raw.asset || raw.resource || 'inconnu'),
  }
}

function userAgentFor(alert) {
  if (alert.source === 'WAF') return 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101'
  if (alert.source === 'SIEM') return 'okta-sso/2.4'
  return 'aws-sdk-go/1.44'
}

function stubCase(alert) {
  const ip = alert.ip || '0.0.0.0'
  const ua = userAgentFor(alert)
  const escalate = alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
  const ticket = escalate ? makeTicket(alert) : null
  return {
    alertId: alert.id,
    ticketId: ticket?.id ?? null,
    title: `${alert.type} sur ${alert.asset}`,
    severity: alert.severity,
    confidence: alert.score,
    intel: scanFromAlert(alert),
    diagnostic: buildDiagnostic(alert),
    cmdb: alert.cmdb,
    raw: {
      ip,
      instanceId: alert.asset,
      accountId: '123456789012',
      userAgent: ua,
      api: alert.type,
      region: alert.region,
      vpc: 'n/a',
    },
    masked: {
      ip: maskIp(ip),
      instanceId: maskId(alert.asset),
      accountId: '12**********89',
      userAgent: ua,
      api: alert.type,
      region: alert.region,
      vpc: 'n/a',
    },
    verdict: escalate
      ? `Alerte ${alert.severity} (${alert.type}). Escalade L2 envoyée, isolation non exécutée.`
      : `Alerte ${alert.severity} — bruit L1 probable, pas d’escalade.`,
    steps: [
      { id: 'scheduler', agent: 'Agent 4 · Planificateur', time: alert.receivedAt, summary: `Ingestion — ${alert.id}`, delayMs: 700 },
      { id: 'extract', agent: 'Agent 1 · Extraction', time: alert.receivedAt, summary: `Ressource ${alert.asset} · type ${alert.type}`, delayMs: 800 },
      { id: 'mask', agent: 'Masquage · sécurité dès la conception', time: alert.receivedAt, summary: `${ip} → ${maskIp(ip)}`, highlight: true, delayMs: 800 },
      { id: 'intel', agent: 'Agent 2 · Analyse', time: alert.receivedAt, summary: escalate ? `Priorité ${alert.severity} · ${alert.type}` : `Bruit probable · ${alert.type}`, delayMs: 800 },
      { id: 'llm', agent: 'Agent 2b · Analyse LLM', time: alert.receivedAt, summary: 'Verdict · données masquées', delayMs: 1000 },
      { id: 'notify', agent: 'Agent 3 · Notification', time: alert.receivedAt, summary: ticket ? 'Ticket L2 envoyé · isolation non exécutée' : 'Pas d’escalade', delayMs: 700 },
    ],
    ticket,
  }
}

const ARRIVAL_OFFSETS_SEC = [
  0, 80, 190, 247, 412, 538, 721, 1104, 1189, 1634, 1912, 2140, 2598, 3187,
]

function stampArrivals(alerts) {
  const now = Date.now()
  alerts.forEach((alert, index) => {
    const offset = ARRIVAL_OFFSETS_SEC[index] ?? index * 97 + 23
    const at = now - offset * 1000
    alert.receivedAtMs = at
    alert.receivedAt = formatClock(new Date(at))
  })
}

function casesFromAlerts(alerts) {
  return Object.fromEntries(alerts.map((alert) => [alert.caseId, stubCase(alert)]))
}

function reloadFromSnapshot() {
  soc.stopped = false
  soc.running = false
  soc.launched = false
  soc.autopilot = false
  batchIds = new Set()
  clearLiveTreats()
  soc.sentTickets = []
  soc.logs = []
  logSeq = 0
  soc.agents.forEach((agent) => {
    agent.status = 'IDLE'
  })
  soc.currentAgentId = ''
  soc.dashSlice = null
  soc.lastArrival = null
  applySnapshot()
}

export function stopPipeline() {
  soc.stopped = true
  soc.running = false
  soc.autopilot = false
  batchIds = new Set()
  clearLiveTreats()
  soc.agents.forEach((agent) => {
    agent.status = 'STOP'
  })
  pushLog('scheduler', 'Arrêt d’urgence — pipeline stoppé, aucun contenu brut envoyé', 'warn')
}

export function resetDemo() {
  stopIngest()
  resetLiveSeq()
  const alerts = clone(snapshot.alerts)
  stampArrivals(alerts)
  snapshot.alerts = alerts
  snapshot.cases = casesFromAlerts(alerts)
  reloadFromSnapshot()
  pushLog('scheduler', 'Session réinitialisée — file rechargée', 'ok')
  if (soc.loggedIn) startIngest()
}

export async function loginDemo() {
  if (soc.loggedIn || soc.loginBusy || soc.bootstrapping) return
  soc.loginBusy = true
  await sleep(400)
  soc.loginBusy = false
  soc.bootstrapping = true
  const steps = [
    'Vérification des identifiants',
    'Ouverture de la session',
    'Synchronisation de la file',
    'Chargement de la console',
  ]
  for (const step of steps) {
    soc.bootLabel = step
    await sleep(700)
  }
  soc.loggedIn = true
  soc.bootstrapping = false
  soc.bootLabel = ''
  startIngest()
}

export async function launchWorkflow() {
  if (soc.running) return
  if (soc.stopped) {
    soc.stopped = false
    soc.agents.forEach((agent) => {
      agent.status = 'IDLE'
    })
    soc.currentAgentId = ''
  }
  soc.autopilot = true
  soc.launched = true
  const batch = untreatedQueued.value.slice()
  if (!batch.length) {
    pushLog('scheduler', 'Workflow actif. Les nouvelles alertes sont traitées en 2 s.', 'ok')
    return
  }
  soc.running = true
  batchIds = new Set(batch.map((alert) => alert.id))

  pushLog(
    'scheduler',
    `Workflow actif · lot ${batch.length} · les nouvelles seront traitées en 2 s.`,
    'ok',
  )
  setAgent('scheduler', 'RUN')
  await sleep(900)
  if (soc.stopped) return
  setAgent('scheduler', 'OK')

  setAgent('extract', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    alert.agentLabel = 'Extraction…'
    pushLog('extract', `${alert.id} · ${alert.type} · ${alert.asset}`)
    await sleep(280)
  }
  setAgent('extract', 'OK')

  setAgent('intel', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    const hint = intelHint(alert)
    alert.agentLabel = 'Analyse…'
    pushLog('intel', `${alert.id} · ${hint}`)
    await sleep(280)
  }
  setAgent('intel', 'OK')

  setAgent('llm', 'WAIT')
  await sleep(400)
  setAgent('llm', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    alert.agentLabel = 'LLM…'
    if (soc.config.maskPii) {
      pushLog('llm', `${alert.id} · données masquées avant analyse`, 'ok')
    } else {
      pushLog(
        'llm',
        `${alert.id} · masquage opérateur désactivé — le garde-fou masque quand même`,
        'warn',
      )
    }
    await sleep(320)
  }
  setAgent('llm', 'OK')

  setAgent('notify', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    if (DONE_STATUSES.includes(alert.status)) {
      pushLog('notify', `${alert.id} · déjà classée · ${alert.agentLabel}`)
      await sleep(120)
      continue
    }
    const outcome = classifyAlert(alert)
    if (outcome === 'ready') {
      confirmL2Send(alert.caseId)
    } else {
      pushLog('notify', `${alert.id} · ${alert.agentLabel} · pas de ticket`, 'ok', 'treat')
    }
    await sleep(220)
  }
  if (!soc.stopped) {
    for (const alert of batch) sealCase(alert)
    const sent = batch.filter((alert) => alert.status === 'escalated').length
    const closed = batch.length - sent
    setAgent('notify', 'OK')
    pushLog(
      'scheduler',
      `Lot terminé · ${sent} ticket(s) L2 envoyé(s) · ${closed} classée(s) L1 · mode live ON`,
      'ok',
    )
    untreatedQueued.value.forEach((alert) => scheduleLiveTreat(alert))
  }

  batchIds = new Set()
  soc.running = false
}

function sealCase(alert) {
  const item = soc.cases[alert.caseId]
  if (!item) return
  item.steps.forEach((step) => {
    step.status = 'ok'
  })
  item.played = true
  item.playing = false
  if (item.sent) {
    item.hitl = 'notified'
    return
  }
  if (alert.status === 'closed') item.hitl = 'l1'
  else if (alert.status === 'false_positive') item.hitl = 'false_positive'
  else item.hitl = 'idle'
}

export function ensureTicket(caseId) {
  const item = soc.cases[caseId]
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (!item || !alert) return null
  if (!item.ticket) {
    item.ticket = makeTicket(alert)
    item.ticketId = item.ticket.id
  }
  return item.ticket
}

export function treatAtL1(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.sent || isL1Locked(caseId)) return
  item.hitl = 'l1'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) stampTreated(alert, 'closed', 'Traité L1')
  pushLog('l1', `${item.alertId} · traité côté L1 · pas d’escalade`, 'ok', 'treat')
}

export function markFalsePositive(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.sent || isL1Locked(caseId)) return
  item.hitl = 'false_positive'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) stampTreated(alert, 'false_positive', 'Faux positif')
  pushLog('l1', `${item.alertId} · classé faux positif`, 'ok', 'treat')
}

export function inspectTicket(caseId) {
  const item = soc.cases[caseId]
  if (!item?.ticket || !item.sent) return
  item.hitl = 'notified'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) stampTreated(alert, 'escalated', 'Ticket L2')
}

export function confirmL2Send(caseId) {
  const item = soc.cases[caseId]
  if (!item?.ticket || item.sent) return false
  transmitL2Email(caseId)
  inspectTicket(caseId)
  return true
}

export function transmitL2Email(caseId) {
  const item = soc.cases[caseId]
  if (!item?.ticket || item.sent) return
  item.sent = true
  soc.sentTickets.unshift({
    id: item.ticket.id,
    caseId,
    at: soc.clock === '--:--:--' ? formatClock() : soc.clock,
  })
  pushLog('notify', `${item.ticket.id} · e-mail L2 transmis`, 'ok', 'treat')
}

export const untreatedQueued = computed(() =>
  queuedAlerts.value.filter((alert) => {
    if (DONE_STATUSES.includes(alert.status)) return false
    return !soc.cases[alert.caseId]?.sent
  }),
)

export const pendingCount = computed(
  () =>
    soc.alerts.filter((alert) => {
      if (DONE_STATUSES.includes(alert.status)) return false
      if (soc.cases[alert.caseId]?.sent) return false
      return ['new', 'ready', 'awaiting_l2'].includes(alert.status)
    }).length,
)

