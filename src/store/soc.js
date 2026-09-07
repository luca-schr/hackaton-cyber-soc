import { computed, reactive } from 'vue'

const AGENT_DEFS = [
  { id: 'scheduler', n: 'A4', label: 'Scheduler', task: 'Poll JSON' },
  { id: 'extract', n: 'A1', label: 'Extract', task: 'IP · UA · asset' },
  { id: 'intel', n: 'A2', label: 'Threat Intel', task: 'IoC · keywords' },
  { id: 'llm', n: 'A2b', label: 'Analyse LLM', task: 'Verdict masqué' },
  { id: 'notify', n: 'A3', label: 'Notify', task: 'Ticket L2 · HITL' },
]

const SOURCE_MAP = {
  'Tous JSON': null,
  'GuardDuty JSON': 'GuardDuty',
  'WAF JSON': 'WAF',
  'SIEM JSON': 'SIEM',
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
  intel: { iocs: [], keywords: [], criticalAssets: [] },
  alerts: [],
  cases: {},
  agents: AGENT_DEFS.map((a) => ({ ...a, status: 'IDLE' })),
  currentAgentId: '',
  config: {
    source: 'Tous JSON',
    mode: 'Batch 10 alertes',
    maskPii: true,
    autoRemediate: false,
  },
  sentTickets: [],
  logs: [],
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
    const [alertsRes, casesRes, intelRes] = await Promise.all([
      fetch(dataUrl('alerts.json')),
      fetch(dataUrl('cases.json')),
      fetch(dataUrl('intel.json')),
    ])
    if (!alertsRes.ok || !casesRes.ok) {
      throw new Error('Impossible de lire les JSON locaux')
    }
    const alertsDoc = await alertsRes.json()
    const casesDoc = await casesRes.json()
    const intelDoc = intelRes.ok ? await intelRes.json() : { iocs: [], keywords: [], criticalAssets: [] }
    snapshot = {
      meta: clone(alertsDoc.meta),
      kpis: clone(alertsDoc.kpis),
      alerts: clone(alertsDoc.alerts),
      cases: clone(casesDoc),
      intel: clone(intelDoc),
    }
    applySnapshot()
    soc.loaded = true
    pushLog('scheduler', 'Sources JSON locales chargées (alerts, cases, intel)', 'ok')
  } catch (err) {
    soc.error = err.message || 'Chargement JSON échoué'
  }
}

function applySnapshot() {
  if (!snapshot) return
  soc.meta = clone(snapshot.meta)
  soc.kpis = clone(snapshot.kpis)
  soc.intel = clone(snapshot.intel)
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
  const starMode = soc.config.mode.includes('unique')
  if (starMode) return soc.alerts.filter((alert) => alert.star)
  const source = SOURCE_MAP[soc.config.source]
  if (!source) return soc.alerts
  return soc.alerts.filter((alert) => alert.source === source)
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
  alert.agentLabel = 'Case prêt'
  return 'ready'
}

function intelHint(alert) {
  const item = soc.cases[alert.caseId]
  const hits = item?.intel?.hits || []
  const ioc = soc.intel.iocs?.find((row) => item?.raw?.ip && row.value === item.raw.ip)
  if (ioc) return `IoC ${ioc.feed}`
  if (hits.length) return hits[0]
  return 'pas de match IoC'
}

export function stopPipeline() {
  soc.stopped = true
  soc.running = false
  soc.agents.forEach((agent) => {
    agent.status = 'STOP'
  })
  pushLog('scheduler', 'Kill switch — pipeline stoppé, aucun payload brut envoyé', 'warn')
}

export function resetDemo() {
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
  pushLog('scheduler', 'Démo réinitialisée — file d’alertes rechargée', 'ok')
}

export async function launchWorkflow() {
  if (soc.running || soc.stopped) return
  soc.running = true
  soc.launched = true
  const batch = queuedAlerts.value

  pushLog(
    'scheduler',
    `Ingestion ${soc.config.source} · ${soc.config.mode} · ${batch.length} alerte(s)`,
    'ok',
  )
  setAgent('scheduler', 'RUN')
  await sleep(900)
  if (soc.stopped) return
  setAgent('scheduler', 'OK')

  setAgent('extract', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    alert.agentLabel = 'Extract…'
    pushLog('extract', `${alert.id} · ${alert.type} · ${alert.asset}`)
    await sleep(280)
  }
  setAgent('extract', 'OK')

  setAgent('intel', 'RUN')
  for (const alert of batch) {
    if (soc.stopped) return
    const hint = intelHint(alert)
    alert.agentLabel = 'Intel…'
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
      pushLog('llm', `${alert.id} · payload masqué (PII stripped)`, 'ok')
    } else {
      pushLog(
        'llm',
        `${alert.id} · masquage opérateur OFF — guardrail force le strip PII`,
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
      pushLog('notify', `${alert.id} · case prêt · ticket proposé (HITL)`, 'ok')
    } else {
      pushLog('notify', `${alert.id} · ${alert.agentLabel} · pas de ticket`)
    }
    await sleep(220)
  }
  if (!soc.stopped) {
    const ready = batch.filter((alert) => alert.status === 'ready').length
    setAgent('notify', ready ? 'OK' : 'IDLE')
    pushLog('scheduler', `Batch terminé · ${ready} case(s) à ouvrir · auto-remediate OFF`, 'ok')
  }

  soc.running = false
}

export async function playCase(caseId) {
  const item = soc.cases[caseId]
  if (!item || item.playing || soc.stopped) return
  if (item.played) return

  item.playing = true
  pushLog('scheduler', `Case ${caseId} · replay timeline agents`)

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
      pushLog(mapped === 'extract' && step.id === 'mask' ? 'extract' : mapped, step.summary)
    }
    await sleep(Math.max(step.delayMs || 700, 1100))
    step.status = 'ok'
    if (['scheduler', 'extract', 'intel', 'llm', 'notify'].includes(mapped)) {
      setAgent(mapped, 'OK')
    }
    await sleep(280)
  }

  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) {
    alert.status = item.ticket ? 'awaiting_l2' : 'closed'
    alert.agentLabel = item.ticket ? 'HITL L2' : 'Clos FP'
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

export function approveEscalation(caseId) {
  const item = soc.cases[caseId]
  if (!item || !item.ticket) return
  item.hitl = 'approved'
  const alert = soc.alerts.find((row) => row.caseId === caseId)
  if (alert) {
    alert.status = 'escalated'
    alert.agentLabel = 'Escaladé L2'
  }
  pushLog('notify', `${item.ticket.id} · escalade L2 approuvée (HITL)`, 'ok')
}

export function simulateSend(caseId) {
  const item = soc.cases[caseId]
  if (!item?.ticket || item.sent) return
  item.sent = true
  soc.sentTickets.unshift({
    id: item.ticket.id,
    caseId,
    at: new Date().toISOString(),
  })
  pushLog('notify', `${item.ticket.id} · e-mail L2 simulé (pas d’SMTP réel)`, 'ok')
}

export const pendingCount = computed(
  () =>
    soc.alerts.filter((alert) =>
      ['new', 'ready', 'awaiting_l2', 'escalated'].includes(alert.status),
    ).length,
)
