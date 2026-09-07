<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentLogs from '../components/AgentLogs.vue'
import { SEV_LABEL, STEP_STATUS } from '../labels'
import {
  approveEscalation,
  markFalsePositive,
  playCase,
  soc,
} from '../store/soc'

const route = useRoute()
const router = useRouter()

const item = computed(() => soc.cases[route.params.id])
const alertRow = computed(
  () =>
    soc.alerts.find((alert) => alert.caseId === route.params.id) ||
    soc.alerts.find((alert) => alert.id === item.value?.alertId),
)
const caseLogs = computed(() =>
  soc.logs.filter((row) => {
    const alertId = item.value?.alertId
    const ticketId = item.value?.ticketId
    return (
      row.message.includes(route.params.id) ||
      (alertId && row.message.includes(alertId)) ||
      (ticketId && row.message.includes(ticketId))
    )
  }),
)

const llmPayload = computed(() => item.value?.masked)
const maskNote = computed(() =>
  soc.config.maskPii
    ? 'Données personnelles masquées · contenu envoyé au LLM simulé'
    : 'Masquage opérateur désactivé — le garde-fou a tout de même masqué les données (échec sécurisé)',
)

function stepOk(id) {
  return item.value?.steps?.find((step) => step.id === id)?.status === 'ok'
}

function stepRun(id) {
  return item.value?.steps?.find((step) => step.id === id)?.status === 'run'
}

onMounted(() => playCase(route.params.id))
watch(
  () => route.params.id,
  (id) => playCase(id),
)

function approve() {
  approveEscalation(route.params.id)
  const ticketId = item.value?.ticketId
  if (ticketId) router.push(`/tickets/${route.params.id}`)
}

function reject() {
  markFalsePositive(route.params.id)
  router.push('/alerts')
}
</script>

<template>
  <div class="page" v-if="item">
    <div class="banner warn" v-if="item.hitl === 'pending'">
      Validation L2 requise.
    </div>
    <div class="banner warn" v-if="!soc.config.maskPii">
      Politique de masquage désactivée · le garde-fou a bloqué l’envoi du contenu brut.
    </div>

    <section class="panel sev-card" :class="item.severity">
      <h1>
        {{ alertRow?.id || item.alertId }}
        <span class="sev" :class="item.severity">{{ SEV_LABEL[item.severity] || item.severity }}</span>
      </h1>
      <p class="meta">{{ item.title }} · confiance IA {{ item.confidence }} %</p>
      <div class="kv" style="margin-top: 12px">
        <span>Dossier</span>
        <code>{{ route.params.id }}</code>
        <span>Source</span>
        <code>{{ alertRow?.source || '—' }}</code>
        <span>Ressource</span>
        <code>{{ alertRow?.asset || item.masked?.instanceId }}</code>
        <span>Score</span>
        <code>{{ item.confidence }}</code>
        <span>Reçu</span>
        <code>{{ alertRow?.receivedAt || '—' }}</code>
      </div>
    </section>

    <section class="panel">
      <h2>Preuve par agent</h2>
      <p class="meta" v-if="!stepOk('extract')">En attente de l’extraction…</p>

      <template v-if="stepOk('extract')">
        <div class="label">A1 · Extraction (brut)</div>
        <pre class="pre mono">{{ JSON.stringify(item.raw, null, 2) }}</pre>
      </template>

      <template v-if="stepOk('mask') || stepRun('mask')">
        <h2 style="margin-top: 16px">A1b · Masquage avant LLM</h2>
        <p class="meta">{{ maskNote }}</p>
        <div class="compare">
          <div>
            <div class="label">Avant</div>
            <pre class="pre mono">{{ JSON.stringify(item.raw, null, 2) }}</pre>
          </div>
          <div>
            <div class="label">Après (envoyé au LLM)</div>
            <pre class="pre mono">{{ JSON.stringify(llmPayload, null, 2) }}</pre>
          </div>
        </div>
      </template>

      <template v-if="stepOk('intel')">
        <h2 style="margin-top: 16px">A2 · Analyse de l’alerte</h2>
        <div class="kv">
          <span>Correspondances</span>
          <code>{{ (item.intel?.hits || []).join(' · ') || 'aucune' }}</code>
          <span>Mots-clés</span>
          <code>{{ (item.intel?.keywords || []).join(' · ') || 'aucun' }}</code>
        </div>
      </template>

      <template v-if="stepOk('llm')">
        <h2 style="margin-top: 16px">A2b · Verdict LLM</h2>
        <p>{{ item.verdict }}</p>
      </template>

      <template v-if="stepOk('notify')">
        <h2 style="margin-top: 16px">A3 · Notification</h2>
        <p class="meta">
          {{ item.ticket ? 'Ticket L2 proposé · non exécuté' : 'Pas d’escalade · clos côté L1' }}
        </p>
      </template>
    </section>

    <section class="panel">
      <h2>Évolution de l’analyse</h2>
      <div class="timeline">
        <article
          v-for="step in item.steps"
          :key="step.id"
          class="step"
          :class="{ highlight: step.highlight, running: step.status === 'run', done: step.status === 'ok', queued: step.status === 'queued' }"
        >
          <div class="who">
            {{ step.time }} · {{ step.agent }}
            <strong :class="'status-' + step.status"> {{ STEP_STATUS[step.status] || step.status }}</strong>
          </div>
          <div>{{ step.summary }}</div>
        </article>
      </div>
      <h2 style="margin-top: 16px">Journaux du dossier</h2>
      <AgentLogs :rows="caseLogs" :limit="6" />
    </section>

    <div class="actions">
      <button class="btn ok" :disabled="!item.played || !item.ticket" @click="approve">
        Approuver l’escalade L2
      </button>
      <button class="btn" :disabled="!item.played" @click="reject">Faux positif</button>
      <router-link class="btn" to="/alerts">Retour aux alertes</router-link>
    </div>
  </div>
  <div class="page" v-else>
    <p class="empty">Dossier inconnu. Revenez à la file.</p>
  </div>
</template>
