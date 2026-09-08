export const ARCH_AGENTS = [
  {
    n: 'A4',
    ids: ['scheduler'],
    label: 'Orchestrer',
    models: ['Nova 2 Lite', 'AgentCore'],
    task: 'Ouvre le dossier et lance le flux.',
  },
  {
    n: 'A1',
    ids: ['extract'],
    label: 'Extraire',
    models: ['Nova Micro'],
    task: 'Normalise et masque l’événement.',
  },
  {
    n: 'A2',
    ids: ['intel', 'llm'],
    label: 'Analyser',
    models: ['Claude Sonnet', 'XGBoost', 'Cohere RAG'],
    task: 'Score le dossier. Aucune action système.',
  },
  {
    n: 'A3',
    ids: ['notify'],
    label: 'Notifier',
    models: ['Claude Haiku'],
    task: 'Envoie le ticket L2. N’isole jamais.',
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
