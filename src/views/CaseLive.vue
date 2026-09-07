<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentLogs from '../components/AgentLogs.vue'
import {
  approveEscalation,
  markFalsePositive,
  playCase,
  soc,
} from '../store/soc'

const route = useRoute()
const router = useRouter()

const item = computed(() => soc.cases[route.params.id])
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
    ? 'PII stripped · payload masqué envoyé au LLM simulé'
    : 'Masquage opérateur OFF — guardrail a quand même strippé la PII (fail securely)',
)

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
  router.push('/inbox')
}
</script>

<template>
  <div class="page" v-if="item">
    <div class="banner warn" v-if="item.hitl === 'pending'">
      HITL en attente · l’agent propose, l’humain décide.
    </div>
    <div class="banner warn" v-if="!soc.config.maskPii">
      Politique masquage OFF · le guardrail a bloqué l’envoi du payload brut.
    </div>
    <h1>
      CASE {{ route.params.id }}
      <span class="sev" :class="item.severity"> · {{ item.severity }}</span>
    </h1>
    <p class="meta">{{ item.title }} · confiance IA {{ item.confidence }}%</p>

    <div class="split">
      <section class="panel">
        <h2>Timeline agents</h2>
        <div class="timeline">
          <article
            v-for="step in item.steps"
            :key="step.id"
            class="step"
            :class="{ highlight: step.highlight }"
          >
            <div class="who">
              {{ step.time }} · {{ step.agent }}
              <strong :class="'status-' + step.status"> {{ step.status }}</strong>
            </div>
            <div>{{ step.summary }}</div>
          </article>
        </div>
      </section>

      <section class="panel">
        <h2>Preuve · masquage avant LLM</h2>
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
        <h2 style="margin-top: 16px">Threat intel</h2>
        <div class="kv">
          <span>Hits</span>
          <code>{{ (item.intel?.hits || []).join(' · ') || 'aucun' }}</code>
          <span>Mots-clés</span>
          <code>{{ (item.intel?.keywords || []).join(' · ') || 'aucun' }}</code>
        </div>
        <h2 style="margin-top: 16px">Verdict</h2>
        <p>{{ item.verdict }}</p>
        <h2 style="margin-top: 16px">Logs case</h2>
        <AgentLogs :rows="caseLogs" :limit="6" />
      </section>
    </div>

    <div class="actions">
      <button class="btn ok" :disabled="!item.played || !item.ticket" @click="approve">
        Approuver escalation L2
      </button>
      <button class="btn" :disabled="!item.played" @click="reject">Faux positif</button>
      <router-link class="btn" to="/inbox">Retour inbox</router-link>
    </div>
  </div>
  <div class="page" v-else>
    <p class="empty">Case inconnu. Revenez à l’inbox.</p>
  </div>
</template>
