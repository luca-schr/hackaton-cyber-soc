import { computed, reactive } from 'vue'

const AGENT_DEFS = [
  { id: 'scheduler', n: 'A4', label: 'Planificateur', task: 'Ingestion du flux' },
  { id: 'extract', n: 'A1', label: 'Extraction', task: 'IP · agent · ressource' },
  { id: 'intel', n: 'A2', label: 'Analyse', task: 'type · sévérité · ressource' },
  { id: 'llm', n: 'A2b', label: 'Analyse LLM', task: 'Verdict masqué' },
  { id: 'notify', n: 'A3', label: 'Notification', task: 'Ticket L2 · validation' },
]

const SOURCE_MAP = {
  Tous: null,
  GuardDuty: 'GuardDuty',
  WAF: 'WAF',
  SIEM: 'SIEM',
}

let snapshot = null
let bundledSnapshot = null
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

function dataUrl(file) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}data/${file}`
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

export async function loadData() {
  if (soc.loaded) return
  try {
    const alertsRes = await fetch(dataUrl('alerts.json'))
    if (!alertsRes.ok) {
      throw new Error('Impossible de lire alerts.json')
    }
    const alertsDoc = await alertsRes.json()
    const alerts = (alertsDoc.alerts || []).map(normalizeAlert)
    stampArrivals(alerts)
    snapshot = {
      meta: clone(alertsDoc.meta || {}),
      kpis: clone(alertsDoc.kpis || {}),
      alerts,
      cases: casesFromAlerts(alerts),
    }
    bundledSnapshot = clone(snapshot)
    applySnapshot()
    soc.loaded = true
    pushLog('scheduler', `Démarrage · ${alerts.length} alertes en file`, 'ok')
  } catch (err) {
    soc.error = err.message || 'Chargement JSON échoué'
  }
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

export const attentionAlerts = computed(() => {
  const done = ['ignored', 'false_positive', 'closed', 'escalated']
  return queuedAlerts.value
    .filter(
      (alert) =>
        (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') &&
        !done.includes(alert.status),
    )
    .sort((a, b) => {
      if (a.star !== b.star) return a.star ? -1 : 1
      const gap = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
      return gap !== 0 ? gap : b.score - a.score
    })
})

function classifyAlert(alert) {
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
  const ticketId = escalate ? alert.ticketId || `SOC-L2-${alert.id}` : null
  if (ticketId) alert.ticketId = ticketId
  return {
    alertId: alert.id,
    ticketId,
    title: `${alert.type} sur ${alert.asset}`,
    severity: alert.severity,
    confidence: alert.score,
    intel: scanFromAlert(alert),
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
      ? `Alerte ${alert.severity} (${alert.type}). Escalade L2 proposée, isolation non exécutée.`
      : `Alerte ${alert.severity} — bruit L1 probable, pas d’escalade.`,
    steps: [
      { id: 'scheduler', agent: 'Agent 4 · Planificateur', time: alert.receivedAt, summary: `Ingestion — ${alert.id}`, delayMs: 700 },
      { id: 'extract', agent: 'Agent 1 · Extraction', time: alert.receivedAt, summary: `Ressource ${alert.asset} · type ${alert.type}`, delayMs: 800 },
      { id: 'mask', agent: 'Masquage · sécurité dès la conception', time: alert.receivedAt, summary: `${ip} → ${maskIp(ip)}`, highlight: true, delayMs: 800 },
      { id: 'intel', agent: 'Agent 2 · Analyse', time: alert.receivedAt, summary: escalate ? `Priorité ${alert.severity} · ${alert.type}` : `Bruit probable · ${alert.type}`, delayMs: 800 },
      { id: 'llm', agent: 'Agent 2b · Analyse LLM', time: alert.receivedAt, summary: 'Verdict · données masquées', delayMs: 1000 },
      { id: 'notify', agent: 'Agent 3 · Notification', time: alert.receivedAt, summary: ticketId ? 'Ticket L2 rédigé · confirmation requise' : 'Pas d’escalade', delayMs: 700 },
    ],
    ticket: ticketId
      ? {
          id: ticketId,
          priority: alert.severity === 'CRITICAL' ? 'P1' : 'P2',
          to: 'analystes.l2@checkout.internal',
          subject: `[${alert.severity}] ${alert.type} — ${alert.asset}`,
          summary: `Alerte ${alert.id} (${alert.source}). Contexte masqué avant LLM. Action recommandée, non exécutée.`,
          actions: [
            'Isoler le groupe de sécurité (validation L2)',
            'Instantané disque si instance',
            'Vérifier CloudTrail sur 24 h',
          ],
        }
      : null,
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
    const outcome = classifyAlert(alert)
    if (outcome === 'ready') {
      pushLog('notify', `${alert.id} · ticket L2 rédigé`, 'ok')
    } else {
      pushLog('notify', `${alert.id} · ${alert.agentLabel} · pas de ticket`)
    }
    await sleep(220)
  }
  if (!soc.stopped) {
    for (const alert of batch) sealCase(alert)
    const ready = batch.filter((alert) =>
      ['ready', 'awaiting_l2'].includes(alert.status),
    ).length
    setAgent('notify', ready ? 'OK' : 'IDLE')
    pushLog('scheduler', `Lot terminé · ${ready} ticket(s) L2 · ${batch.length - ready} classée(s) L1`, 'ok')
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
  if (item.ticket && (alert.status === 'ready' || alert.status === 'awaiting_l2')) {
    alert.status = 'awaiting_l2'
    alert.agentLabel = 'Attention L2'
    item.hitl = 'pending'
  } else {
    item.hitl = 'idle'
  }
}

export async function playCase(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.playing || soc.stopped) return
  if (item.played) return

  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert && alert.status !== 'new') {
    sealCase(alert)
    return
  }

  item.playing = true
  pushLog('scheduler', `${item.alertId} · analyse du dossier`)

  for (const step of item.steps) {
    if (soc.stopped) {
      item.playing = false
      return
    }
    step.status = 'run'
    const mapped =
      step.id === 'mask' ? 'extract' : step.id === 'llm' ? 'llm' : step.id
    if (['scheduler', 'extract', 'intel', 'llm', 'notify'].includes(mapped)) {
      setAgent(mapped, 'RUN')
    }
    if (step.id === 'mask' && !soc.config.maskPii) {
      pushLog('extract', `${item.alertId} · guardrail masquage forcé`, 'warn')
    } else {
      pushLog(
        mapped === 'extract' && step.id === 'mask' ? 'extract' : mapped,
        step.summary,
      )
    }
    await sleep(step.delayMs || 600)
    step.status = 'ok'
    if (['scheduler', 'extract', 'intel', 'llm', 'notify'].includes(mapped)) {
      setAgent(mapped, 'OK')
    }
  }

  if (alert) {
    alert.status = item.ticket ? 'awaiting_l2' : 'closed'
    alert.agentLabel = item.ticket ? 'Attention L2' : 'Clos · L1'
  }

  item.played = true
  item.playing = false
  item.hitl = item.ticket ? 'pending' : 'idle'
}

export function markFalsePositive(caseId) {
  const item = soc.cases[caseId]
  if (!item) return
  item.hitl = 'false_positive'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) {
    alert.status = 'false_positive'
    alert.agentLabel = 'FP L2'
  }
  pushLog('notify', `${item.alertId} · classé faux positif L2`)
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
      ['new', 'ready', 'awaiting_l2', 'escalated'].includes(alert.status),
    ).length,
)

export const liveKpis = computed(() => {
  const alerts = soc.alerts
  const total = alerts.length
  const sources = {}
  alerts.forEach((alert) => {
    sources[alert.source] = (sources[alert.source] || 0) + 1
  })
  const sourceHint = Object.entries(sources)
    .map(([name, count]) => `${count} ${name}`)
    .join(' · ')
  const highCrit = alerts.filter(
    (alert) => alert.severity === 'HIGH' || alert.severity === 'CRITICAL',
  ).length
  const closedL1 = alerts.filter((alert) =>
    ['ignored', 'false_positive', 'closed'].includes(alert.status),
  ).length
  const tickets = alerts.filter((alert) =>
    ['ready', 'awaiting_l2', 'escalated'].includes(alert.status),
  ).length
  const waitingL2 = alerts.filter((alert) => alert.status === 'awaiting_l2').length
  const lastIn = alerts[0]?.receivedAt || '—'

  if (!soc.launched) {
    return [
      { label: 'File', value: String(total), hint: sourceHint || '—' },
      { label: 'Haute priorité', value: String(highCrit), hint: 'HIGH · CRITICAL' },
      { label: 'Dernière réception', value: lastIn, hint: 'arrivée la plus récente' },
      { label: 'À ingérer', value: String(total), hint: 'en attente de triage' },
    ]
  }

  const pct = total ? Math.round((closedL1 / total) * 100) : 0
  return [
    { label: 'File', value: String(total), hint: sourceHint || '—' },
    { label: 'Classées L1', value: String(closedL1), hint: `${pct} % de la file` },
    { label: 'Tickets L2', value: String(tickets), hint: waitingL2 ? `${waitingL2} en attente` : 'traités' },
    { label: 'Dernière réception', value: lastIn, hint: 'arrivée la plus récente' },
  ]
})
