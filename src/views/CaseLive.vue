<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentLogs from '../components/AgentLogs.vue'
import { SEV_LABEL, STEP_STATUS } from '../labels'
import { confirmL2Send, markFalsePositive, playCase, soc } from '../store/soc'

const route = useRoute()
const router = useRouter()
const proofOpen = ref(false)
const drafting = ref(false)

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
    ? 'Données personnelles masquées avant envoi au LLM'
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
  (id) => {
    proofOpen.value = false
    drafting.value = false
    playCase(id)
  },
)

function startEscalation() {
  drafting.value = true
}

function confirmSend() {
  if (!confirmL2Send(route.params.id)) return
  drafting.value = false
  router.push(`/tickets/${route.params.id}`)
}

function reject() {
  markFalsePositive(route.params.id)
  router.push('/alerts')
}
</script>

<template>
  <div class="page" v-if="item">
    <div class="banner warn" v-if="item.playing">
      Analyse en cours · extraction, masquage, LLM…
    </div>
    <div class="banner" v-else-if="item.sent">
      Ticket L2 transmis · isolation non exécutée.
    </div>
    <div class="banner warn" v-else-if="item.ticket && item.played">
      Ticket rédigé · confirmer l’escalade L2 ou classer faux positif.
    </div>
    <div class="banner" v-else-if="!item.played">
      Ouverture du dossier · l’analyse démarre.
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

    <section class="panel fold">
      <button class="fold-toggle" type="button" @click="proofOpen = !proofOpen">
        <h2>Preuve par agent</h2>
        <svg class="fold-arrow" :class="{ open: proofOpen }" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M6 3.2 11.2 8 6 12.8V3.2z" />
        </svg>
      </button>
      <div v-show="proofOpen" class="fold-body">
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
            {{ item.ticket ? (item.sent ? 'Ticket L2 transmis · isolation non exécutée' : 'Ticket L2 rédigé par le LLM · en attente de confirmation') : 'Pas d’escalade · clos côté L1' }}
          </p>
        </template>
      </div>
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

    <section class="panel" v-if="drafting && item.ticket && !item.sent">
      <h2>Rédaction du ticket L2</h2>
      <p class="meta">{{ item.ticket.subject }}</p>
      <div class="kv" style="margin-top: 12px">
        <span>À</span>
        <code>{{ item.ticket.to }}</code>
        <span>Priorité</span>
        <code>{{ item.ticket.priority }}</code>
        <span>Résumé</span>
        <code>{{ item.ticket.summary }}</code>
      </div>
      <h3 style="margin-top: 16px">Actions recommandées</h3>
      <ol>
        <li v-for="action in item.ticket.actions" :key="action">{{ action }}</li>
      </ol>
      <div class="actions">
        <button class="btn ok" @click="confirmSend">Confirmer l’envoi L2</button>
        <button class="btn" @click="drafting = false">Annuler</button>
      </div>
    </section>

    <div class="actions">
      <button
        v-if="item.ticket && !item.sent"
        class="btn primary"
        :disabled="!item.played || item.playing || drafting"
        @click="startEscalation"
      >
        Escalade L2
      </button>
      <router-link v-else-if="item.ticket" class="btn primary" :to="`/tickets/${route.params.id}`">
        Ouvrir le ticket L2
      </router-link>
      <button class="btn" :disabled="!item.played || item.playing" @click="reject">Faux positif</button>
      <router-link class="btn" to="/alerts">Retour aux alertes</router-link>
    </div>
  </div>
  <div class="page" v-else>
    <p class="empty">Dossier inconnu. Revenez à la file.</p>
  </div>
</template>
