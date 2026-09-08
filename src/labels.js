export const SEV_LABEL = {
  CRITICAL: 'Critique',
  HIGH: 'Haute',
  LOW: 'Basse',
}

export const CRIT_LABEL = {
  vital: 'C1 vital',
  sensible: 'C2 sensible',
  standard: 'C3 standard',
  secondaire: 'C4 secondaire',
}

export const ALERT_STATUS = {
  new: 'Nouveau',
  ready: 'Prêt',
  awaiting_l2: 'Attente L2',
  escalated: 'Escaladé',
  false_positive: 'Faux positif',
  ignored: 'Ignorée',
  closed: 'Traité L1',
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
  l1: 'L1',
}
