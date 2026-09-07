export const SEV_LABEL = {
  CRITICAL: 'Critique',
  HIGH: 'Élevée',
  MEDIUM: 'Moyenne',
  LOW: 'Faible',
}

export const ALERT_STATUS = {
  new: 'Nouveau',
  ready: 'Prêt',
  awaiting_l2: 'Attente L2',
  escalated: 'Escaladé',
  false_positive: 'Faux positif',
  ignored: 'Ignorée',
  closed: 'Clos',
}

export const AGENT_STATUS = {
  IDLE: 'inactif',
  RUN: 'en cours',
  WAIT: 'attente',
  OK: 'ok',
  STOP: 'arrêt',
}

export const STEP_STATUS = {
  queued: 'en file',
  run: 'en cours',
  ok: 'ok',
}

export const LOG_AGENT = {
  scheduler: 'planif.',
  extract: 'extraction',
  intel: 'analyse',
  llm: 'LLM',
  notify: 'notif.',
}
