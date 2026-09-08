export const ARCH_AGENTS = [
  {
    n: 'A4',
    ids: ['scheduler'],
    label: 'Orchestrer',
    models: ['Nova 2 Lite', 'AgentCore'],
    input: 'Flux GuardDuty, WAF, SIEM et config versionnee',
    output: 'Cas ouvert, case_id, timeouts et traces',
    task: 'Ouvre le cas, charge la config, attribue le case_id, relance ou escalade.',
  },
  {
    n: 'A1',
    ids: ['extract'],
    label: 'Extraire',
    models: ['Nova Micro'],
    input: 'Evenement brut',
    output: 'Evenement valide, dedoublonne, normalise et masque',
    task: 'Valide, dedoublonne, normalise, puis masque IP et donnees sensibles.',
  },
  {
    n: 'A2',
    ids: ['intel', 'llm'],
    label: 'Analyser',
    models: ['Claude Sonnet', 'XGBoost', 'Cohere RAG'],
    input: 'Evenement masque, CMDB, criticite, runbooks',
    output: 'Qualification, score 0-100, preuves et incertitudes',
    task: 'Enrichit, recoupe, explique et calcule le score. Jamais d action systeme.',
  },
  {
    n: 'A3',
    ids: ['notify'],
    label: 'Proposer',
    models: ['Claude Haiku'],
    input: 'Dossier qualifie (score et preuves)',
    output: 'Ticket P1/P2, action proposee, notification L2',
        task: 'Cree le ticket selon le score et envoie la notification L2. Isolation jamais executee.',
  },
]

export const SCORE_BANDS = [
  {
    id: 'watch',
    min: 0,
    range: '0-49',
    label: 'Surveillance',
    ticket: null,
    action: 'Alerte enregistree. N2 non interrompu.',
  },
  {
    id: 'p2',
    min: 50,
    range: '50-79',
    label: 'P2',
    ticket: 'P2',
    action: 'Ticket P2 dans la file SOC N2.',
  },
  {
    id: 'p1',
    min: 80,
    range: '80-100',
    label: 'P1',
    ticket: 'P1',
    action: 'Ticket P1 et alerte immediate du SOC N2.',
  },
]

export function bandFromScore(score) {
  const n = Number(score)
  if (n >= 80) return SCORE_BANDS[2]
  if (n >= 50) return SCORE_BANDS[1]
  return SCORE_BANDS[0]
}
