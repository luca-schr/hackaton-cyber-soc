<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ALERT_STATUS, SEV_LABEL } from '../labels'
import { soc } from '../store/soc'

const router = useRouter()
const OPEN_STATUSES = ['new', 'ready', 'awaiting_l2']
const TREATED_STATUSES = ['ignored', 'false_positive', 'closed', 'escalated']

const severity = ref('ALL')
const source = ref('ALL')
const resource = ref('ALL')
const selectedId = ref('')

const sources = computed(() => [...new Set(soc.alerts.map((a) => a.source))])
const resources = computed(() => [...new Set(soc.alerts.map((a) => a.resourceType))])

function matchesFilters(alert) {
  if (severity.value !== 'ALL' && alert.severity !== severity.value) return false
  if (source.value !== 'ALL' && alert.source !== source.value) return false
  if (resource.value !== 'ALL' && alert.resourceType !== resource.value) return false
  return true
}

const openAlerts = computed(() =>
  soc.alerts.filter((alert) => matchesFilters(alert) && OPEN_STATUSES.includes(alert.status)),
)

const treatedAlerts = computed(() =>
  soc.alerts.filter((alert) => matchesFilters(alert) && TREATED_STATUSES.includes(alert.status)),
)

const selected = computed(
  () =>
    soc.alerts.find((alert) => alert.id === selectedId.value) ||
    openAlerts.value[0] ||
    treatedAlerts.value[0],
)

const selectedCase = computed(() =>
  selected.value ? soc.cases[selected.value.caseId] : null,
)

function openCase() {
  if (!selected.value) return
  router.push(`/cases/${selected.value.caseId}`)
}
</script>

<template>
  <div class="page">
    <h1>Alerts · {{ openAlerts.length }} en file</h1>
    <div v-if="!soc.launched" class="banner">
      Lancez le workflow depuis le Dashboard pour simuler l’ingestion.
    </div>

    <section class="panel filters">
      <div class="row">
        <div class="field">
          <label>Sévérité</label>
          <select v-model="severity">
            <option value="ALL">Tous</option>
            <option value="CRITICAL">Critique</option>
            <option value="HIGH">Élevée</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="LOW">Faible</option>
          </select>
        </div>
        <div class="field">
          <label>Source</label>
          <select v-model="source">
            <option value="ALL">Tous</option>
            <option v-for="item in sources" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div class="field">
          <label>Ressource</label>
          <select v-model="resource">
            <option value="ALL">Tous</option>
            <option v-for="item in resources" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
      </div>
    </section>

    <div class="split">
      <section class="panel">
        <h2>File ouverte</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Ressource</th>
              <th>Score</th>
              <th>Reçu</th>
              <th>Statut</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="alert in openAlerts"
              :key="alert.id"
              class="clickable"
              :class="{ selected: selected?.id === alert.id, star: alert.star }"
              @click="selectedId = alert.id"
            >
              <td class="mono">{{ alert.id }}</td>
              <td>
                <div class="sev" :class="alert.severity">{{ SEV_LABEL[alert.severity] || alert.severity }}</div>
                {{ alert.type }}
              </td>
              <td class="mono">{{ alert.asset }}</td>
              <td class="mono">{{ alert.score }}</td>
              <td class="mono">{{ alert.receivedAt }}</td>
              <td>{{ ALERT_STATUS[alert.status] || alert.status }}</td>
              <td>{{ alert.agentLabel }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!openAlerts.length" class="empty">Aucune alerte en file.</p>
      </section>

      <aside class="panel sev-card" :class="selected.severity" v-if="selected">
        <h2>
          {{ selected.id }}
          <span class="sev" :class="selected.severity">{{ SEV_LABEL[selected.severity] || selected.severity }}</span>
        </h2>
        <div class="kv" v-if="selectedCase">
          <span>IP source</span>
          <code>{{ selectedCase.masked.ip }} · déjà masquée</code>
          <span>Navigateur</span>
          <code>{{ selectedCase.masked.userAgent }}</code>
          <span>Compte AWS</span>
          <code>{{ selectedCase.masked.accountId }}</code>
          <span>Région</span>
          <code>{{ selectedCase.masked.region }}</code>
          <span>Reçu</span>
          <code>{{ selected.receivedAt }}</code>
          <span>Analyse</span>
          <code>{{ (selectedCase.intel?.hits || []).join(' · ') || (selectedCase.intel?.keywords || []).join(' · ') || '—' }}</code>
          <span>Dossier</span>
          <code>{{ selected.caseId }}</code>
        </div>
        <p v-else class="empty">Pas de dossier détaillé.</p>
        <div class="actions">
          <button class="btn primary" :disabled="!selectedCase" @click="openCase">
            Ouvrir le dossier
          </button>
        </div>
      </aside>
    </div>

    <section class="panel">
      <h2>Alertes traitées · {{ treatedAlerts.length }}</h2>
      <p class="meta" style="margin: -4px 0 12px">
        Faible → ignorée L1 · moyenne → faux positif · L2 validé → escaladé
      </p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Sévérité</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Reçu</th>
            <th>Décision</th>
            <th>Motif</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="alert in treatedAlerts"
            :key="alert.id"
            class="clickable"
            :class="{ selected: selected?.id === alert.id }"
            @click="selectedId = alert.id"
          >
            <td class="mono">{{ alert.id }}</td>
            <td class="sev" :class="alert.severity">{{ SEV_LABEL[alert.severity] || alert.severity }}</td>
            <td>{{ alert.type }}</td>
            <td class="mono">{{ alert.asset }}</td>
            <td class="mono">{{ alert.receivedAt }}</td>
            <td>{{ ALERT_STATUS[alert.status] || alert.status }}</td>
            <td>{{ alert.agentLabel }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="soc.launched && !treatedAlerts.length" class="empty">Aucune alerte traitée pour ces filtres.</p>
      <p v-else-if="!soc.launched" class="empty">Le triage n’a pas encore tourné.</p>
    </section>
  </div>
</template>
