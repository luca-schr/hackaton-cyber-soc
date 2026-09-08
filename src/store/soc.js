import { computed, reactive } from 'vue'
import alertsDoc from '../data/alerts.json'
import { lookupCmdb } from '../data/cmdb'
import { bandFromScore } from '../data/architecture'
import { SEV_LABEL } from '../labels'

const AGENT_DEFS = [
  { id: 'scheduler', n: 'A4', label: 'Planificateur', task: 'Ingestion du flux' },
  { id: 'extract', n: 'A1', label: 'Extraction', task: 'IP · agent · ressource' },
  { id: 'intel', n: 'A2', label: 'Analyse', task: 'type · sévérité · ressource' },
  { id: 'llm', n: 'A2b', label: 'Analyse LLM', task: 'Verdict masqué' },
  { id: 'notify', n: 'A3', label: 'Notification', task: 'Ticket L2 · envoi' },
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

export const soc = reactive({
  loaded: false,
  error: '',
  running: false,
  stopped: false,
  launched: false,
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

export function pushLog(agent, message, level = 'info') {
  soc.logs.unshift({
    id: ++logSeq,
    time: soc.clock === '--:--:--' ? formatClock() : soc.clock,
    agent,
    message,
    level,
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

const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const L1_DONE = ['ignored', 'false_positive', 'closed']
const L2_STATUSES = ['ready', 'awaiting_l2', 'escalated']
const DONE_STATUSES = ['ignored', 'false_positive', 'closed', 'escalated']

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
  return [...alerts].sort((a, b) => {
    if (a.star !== b.star) return a.star ? -1 : 1
    const gap = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
    if (gap !== 0) return gap
    return b.score - a.score
  })
}

function pathBucket(alert) {
  if (L1_DONE.includes(alert.status)) return 'l1'
  if (L2_STATUSES.includes(alert.status)) return 'l2'
  return 'file'
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
    value: String(sevs.CRITICAL + sevs.HIGH),
    slices: [
      { key: 'CRITICAL', label: SEV_LABEL.CRITICAL, n: sevs.CRITICAL, color: '#ef4444' },
      { key: 'HIGH', label: SEV_LABEL.HIGH, n: sevs.HIGH, color: '#f97316' },
      { key: 'other', label: 'Autres', n: sevs.MEDIUM + sevs.LOW, color: '#9ca3af' },
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
    label: 'Score A2',
    value: String(bands.p1 + bands.p2),
    defaultKey: 'p1',
    slices: [
      { key: 'p1', label: 'P1', n: bands.p1, color: '#ef4444' },
      { key: 'p2', label: 'P2', n: bands.p2, color: '#f97316' },
      { key: 'watch', label: 'Surveillance', n: bands.watch, color: '#9ca3af' },
    ],
  }
}

function pathWidget(alerts) {
  const buckets = { l1: 0, l2: 0, file: 0 }
  alerts.forEach((alert) => {
    buckets[pathBucket(alert)] += 1
  })
  return {
    id: 'path',
    type: 'pie',
    label: 'Parcours',
    value: String(buckets.l1 + buckets.l2),
    defaultKey: soc.launched ? 'l2' : 'file',
    slices: [
      { key: 'l1', label: 'L1', n: buckets.l1, color: '#15fd00' },
      { key: 'l2', label: 'L2', n: buckets.l2, color: '#ef4444' },
      { key: 'file', label: 'File', n: buckets.file, color: '#00dfff' },
    ],
  }
}

function matchesDashSlice(alert, slice) {
  if (!slice) return true
  const { widgetId, key } = slice
  if (widgetId === 'source') return alert.source === key
  if (widgetId === 'severity') {
    if (key === 'other') return alert.severity === 'MEDIUM' || alert.severity === 'LOW'
    return alert.severity === key
  }
  if (widgetId === 'score') return bandFromScore(alert.score).id === key
  if (widgetId === 'path') return pathBucket(alert) === key
  return true
}

export const dashboardWidgets = computed(() => {
  const alerts = queuedAlerts.value
  return [sourceWidget(alerts), severityWidget(alerts), scoreWidget(alerts), pathWidget(alerts)]
})

export const drillAlerts = computed(() =>
  sortQueue(queuedAlerts.value.filter((alert) => matchesDashSlice(alert, soc.dashSlice))),
)

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
      hint: 'Cas derrière le chiffre. Clic pour ouvrir le dossier.',
      count: n,
    }
  }
  return {
    title: 'File',
    hint: 'Clic widget pour filtrer, clic ligne pour ouvrir le dossier.',
    count: n,
  }
})

function classifyAlert(alert) {
  if (DONE_STATUSES.includes(alert.status)) return alert.status
  const item = soc.cases[alert.caseId]
  if (!item) {
    alert.status = 'ignored'
    alert.agentLabel = 'Sans dossier'
    return 'ignored'
  }
  if (alert.severity === 'LOW') {
    alert.status = 'ignored'
    alert.agentLabel = 'Ignoré L1'
    return 'ignored'
  }
  if (!item.ticket) {
    alert.status = 'false_positive'
    alert.agentLabel = 'FP classé'
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
    star: Boolean(raw.star),
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
    alert.receivedAt = formatClock(new Date(now - offset * 1000))
  })
}

function casesFromAlerts(alerts) {
  return Object.fromEntries(alerts.map((alert) => [alert.caseId, stubCase(alert)]))
}

function reloadFromSnapshot() {
  soc.stopped = false
  soc.running = false
  soc.launched = false
  soc.sentTickets = []
  soc.logs = []
  logSeq = 0
  soc.agents.forEach((agent) => {
    agent.status = 'IDLE'
  })
  soc.currentAgentId = ''
  soc.dashSlice = null
  applySnapshot()
}

export function stopPipeline() {
  soc.stopped = true
  soc.running = false
  soc.agents.forEach((agent) => {
    agent.status = 'STOP'
  })
  pushLog('scheduler', 'Arrêt d’urgence — pipeline stoppé, aucun contenu brut envoyé', 'warn')
}

export function resetDemo() {
  const alerts = clone(snapshot.alerts)
  stampArrivals(alerts)
  snapshot.alerts = alerts
  snapshot.cases = casesFromAlerts(alerts)
  reloadFromSnapshot()
  pushLog('scheduler', 'Session réinitialisée — file rechargée', 'ok')
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
}

export async function launchWorkflow() {
  if (soc.running || soc.stopped) return
  soc.running = true
  soc.launched = true
  const batch = queuedAlerts.value

  pushLog(
    'scheduler',
    `Ingestion ${soc.config.source} · ${batch.length} alerte(s)`,
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
      pushLog('notify', `${alert.id} · ${alert.agentLabel} · pas de ticket`)
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
      `Lot terminé · ${sent} ticket(s) L2 envoyé(s) · ${closed} classée(s) L1`,
      'ok',
    )
  }

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
  if (alert) {
    alert.status = 'closed'
    alert.agentLabel = 'Traité L1'
  }
  pushLog('l1', `${item.alertId} · traité côté L1 · pas d’escalade`, 'ok')
}

export function markFalsePositive(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.sent || isL1Locked(caseId)) return
  item.hitl = 'false_positive'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) {
    alert.status = 'false_positive'
    alert.agentLabel = 'Faux positif'
  }
  pushLog('l1', `${item.alertId} · classé faux positif`, 'ok')
}

export function inspectTicket(caseId) {
  const item = soc.cases[caseId]
  if (!item?.ticket || !item.sent) return
  item.hitl = 'notified'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert && ['ready', 'awaiting_l2'].includes(alert.status)) {
    alert.status = 'escalated'
    alert.agentLabel = 'Ticket L2'
  }
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
  pushLog('notify', `${item.ticket.id} · e-mail L2 transmis`, 'ok')
}

export const pendingCount = computed(
  () =>
    soc.alerts.filter((alert) =>
      ['new', 'ready', 'awaiting_l2'].includes(alert.status),
    ).length,
)

