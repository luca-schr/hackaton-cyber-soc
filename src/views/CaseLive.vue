<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ALERT_STATUS, CRIT_LABEL, SEV_LABEL } from '../labels'
import { bandFromScore } from '../data/architecture'
import {
  confirmL2Send,
  ensureTicket,
  isL1Locked,
  markFalsePositive,
  treatAtL1,
  soc,
} from '../store/soc'

const route = useRoute()
const router = useRouter()
const drafting = ref(false)

const item = computed(() => soc.cases[route.params.id])
const alertRow = computed(
  () =>
    soc.alerts.find((alert) => alert.caseId === route.params.id) ||
    soc.alerts.find((alert) => alert.id === item.value?.alertId),
)
const scoreBand = computed(() => bandFromScore(item.value?.confidence ?? alertRow.value?.score))
const diagnostic = computed(() => item.value?.diagnostic)
const locked = computed(() => isL1Locked(route.params.id))
const suggested = computed(() => diagnostic.value?.suggested)

watch(
  () => route.params.id,
  () => {
    drafting.value = false
  },
)

function startEscalation() {
  if (locked.value) return
  if (!ensureTicket(route.params.id)) return
  drafting.value = true
}

function confirmSend() {
  if (!confirmL2Send(route.params.id)) return
  drafting.value = false
  router.push(`/tickets/${route.params.id}`)
}

function treatL1() {
  treatAtL1(route.params.id)
  router.push('/alerts')
}

function reject() {
  markFalsePositive(route.params.id)
  router.push('/alerts')
}

function bannerText() {
  if (item.value?.sent) return 'Ticket L2 transmis · isolation non exécutée.'
  if (alertRow.value?.status === 'closed') return 'Décision L1 · traité sans escalade.'
  if (alertRow.value?.status === 'false_positive') return 'Décision L1 · faux positif, rien à déclarer.'
  if (alertRow.value?.status === 'ignored') return 'Classée automatiquement · ignorée L1.'
  if (alertRow.value?.status === 'escalated') return 'Escalade L2 déjà transmise.'
  return 'Diagnostic automatique · L1 doit décider : escalade L2, traitement L1 ou faux positif.'
}
</script>

<template>
  <div class="page" v-if="item">
    <div
      class="banner"
      :class="{ warn: !locked }"
    >
      {{ bannerText() }}
    </div>

    <section class="panel sev-card" :class="item.severity">
      <h1>
        {{ alertRow?.id || item.alertId }}
        <span class="sev" :class="item.severity">{{ SEV_LABEL[item.severity] || item.severity }}</span>
      </h1>
      <p class="meta">
        {{ item.title }}
        <template v-if="alertRow">
          · {{ ALERT_STATUS[alertRow.status] || alertRow.status }}
        </template>
      </p>
      <div class="kv">
        <span>Source</span>
        <code>{{ alertRow?.source || '—' }}</code>
        <span>Type</span>
        <code>{{ alertRow?.type || item.title }}</code>
        <span>Ressource</span>
        <code>{{ alertRow?.asset || item.masked?.instanceId }}</code>
        <span>Score</span>
        <code>{{ item.confidence }} {{ scoreBand.label }} ({{ scoreBand.range }})</code>
        <span>Reçu</span>
        <code>{{ alertRow?.receivedAt || '—' }}</code>
        <span>IP (masquée)</span>
        <code>{{ item.masked?.ip }}</code>
        <span>Criticité actif</span>
        <code class="crit" :class="alertRow?.cmdb?.criticality">{{ CRIT_LABEL[alertRow?.cmdb?.criticality] || '—' }}</code>
        <span>Procédure</span>
        <code>{{ alertRow?.cmdb?.sop || item.cmdb?.sop || '—' }}</code>
        <span>CMDB</span>
        <code>{{ (alertRow?.cmdb || item.cmdb)?.desc || '—' }} · {{ (alertRow?.cmdb || item.cmdb)?.env }} · {{ (alertRow?.cmdb || item.cmdb)?.owner }}</code>
      </div>
    </section>

    <section class="panel">
      <h2>Diagnostic automatique</h2>
      <p>{{ diagnostic?.reading }}</p>
      <div class="piste">
        <div class="label">Piste — pas une décision</div>
        <p>{{ diagnostic?.hint }}</p>
      </div>
    </section>

    <section class="panel" v-if="drafting && item.ticket && !item.sent">
      <h2>Ticket L2 à confirmer</h2>
      <p class="meta">{{ item.ticket.subject }}</p>
      <div class="kv">
        <span>À</span>
        <code>{{ item.ticket.to }}</code>
        <span>Priorité</span>
        <code>{{ item.ticket.priority }}</code>
        <span>Résumé</span>
        <code>{{ item.ticket.summary }}</code>
      </div>
      <h3>Actions recommandées (non exécutées)</h3>
      <ol>
        <li v-for="action in item.ticket.actions" :key="action">{{ action }}</li>
      </ol>
      <div class="actions">
        <button class="btn ok" @click="confirmSend">Confirmer l’envoi L2</button>
        <button class="btn" @click="drafting = false">Annuler</button>
      </div>
    </section>

    <div class="actions" v-else>
      <button
        v-if="item.ticket && item.sent"
        class="btn primary"
        @click="router.push(`/tickets/${route.params.id}`)"
      >
        Ouvrir le ticket L2
      </button>
      <template v-else>
        <button
          class="btn primary"
          :class="{ suggested: suggested === 'escalade' }"
          :disabled="locked || drafting"
          @click="startEscalation"
        >
          Escalade L2
        </button>
        <button
          class="btn ok"
          :class="{ suggested: suggested === 'l1' }"
          :disabled="locked || drafting"
          @click="treatL1"
        >
          Traitement L1
        </button>
        <button
          class="btn"
          :class="{ suggested: suggested === 'fp' }"
          :disabled="locked || drafting"
          @click="reject"
        >
          Faux positif
        </button>
      </template>
      <router-link class="btn" to="/alerts">Retour aux alertes</router-link>
    </div>
  </div>
  <div class="page" v-else>
    <p class="empty">Dossier inconnu. Revenez à la file.</p>
  </div>
</template>
