<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ALERT_STATUS, CRIT_LABEL, SEV_LABEL } from '../labels'
import { soc } from '../store/soc'

const router = useRouter()

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

function isTreated(alert) {
  if (['ignored', 'false_positive', 'closed', 'escalated'].includes(alert.status)) return true
  return Boolean(soc.cases[alert.caseId]?.sent)
}

const openAlerts = computed(() =>
  soc.alerts
    .filter((alert) => matchesFilters(alert) && !isTreated(alert))
    .sort((a, b) => (b.receivedAtMs || 0) - (a.receivedAtMs || 0)),
)

const treatedAlerts = computed(() =>
  soc.alerts
    .filter((alert) => matchesFilters(alert) && isTreated(alert))
    .sort((a, b) => (b.treatedAtMs || b.receivedAtMs || 0) - (a.treatedAtMs || a.receivedAtMs || 0)),
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
    <h1>Alerts</h1>
    <div v-if="!soc.launched" class="banner">
      Vous pouvez diagnostiquer une alerte et décider en L1. Le flux arrive en arrière-plan.
    </div>
    <div v-else-if="soc.stopped" class="banner">
      Pipeline arrêté. Aucun contenu brut envoyé.
    </div>
    <div v-else-if="soc.autopilot" class="banner">
      Workflow actif. Chaque nouvelle alerte est traitée en 2 s. Isolation non exécutée.
    </div>
    <div v-else class="banner">
      File du périmètre classée. Tickets L2 envoyés. Isolation non exécutée.
    </div>

    <section class="panel filters">
      <div class="row">
        <div class="field">
          <label>Gravité</label>
          <select v-model="severity">
            <option value="ALL">Tous</option>
            <option value="CRITICAL">{{ SEV_LABEL.CRITICAL }}</option>
            <option value="HIGH">{{ SEV_LABEL.HIGH }}</option>
            <option value="MEDIUM">{{ SEV_LABEL.MEDIUM }}</option>
            <option value="LOW">{{ SEV_LABEL.LOW }}</option>
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

    <div class="alerts-wide">
      <section class="panel">
        <h2>File ouverte</h2>
        <div class="file-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Ressource</th>
              <th>Score</th>
              <th>Reçu</th>
              <th>Statut</th>
              <th>Motif</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="alert in openAlerts"
              :key="alert.id"
              class="clickable"
              :class="{ selected: selected?.id === alert.id, fresh: alert.fresh }"
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
        </div>
      </section>

      <aside class="panel sev-card" :class="selected.severity" v-if="selected">
        <h2>
          {{ selected.id }}
          <span class="sev" :class="selected.severity">{{ SEV_LABEL[selected.severity] || selected.severity }}</span>
        </h2>
        <div class="kv" v-if="selectedCase">
          <span>Criticité actif</span>
          <code class="crit" :class="selected.cmdb?.criticality">{{ CRIT_LABEL[selected.cmdb?.criticality] || '—' }}</code>
          <span>Procédure</span>
          <code>{{ selected.cmdb?.sop || '—' }}</code>
          <span>CMDB</span>
          <code>{{ selected.cmdb?.desc || selected.asset }} · {{ selected.cmdb?.env }} · {{ selected.cmdb?.owner }}</code>
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
            Diagnostic L1
          </button>
          <router-link
            v-if="selectedCase?.ticket && selectedCase.sent"
            class="btn"
            :to="`/tickets/${selected.caseId}`"
          >
            Voir le ticket L2
          </router-link>
        </div>
      </aside>
    </div>

    <details class="panel treated-drop">
      <summary>Alertes traitées</summary>
      <p class="meta">
        Classées L1 (bruit, FP, traité) ou ticket L2 envoyé. Isolation jamais exécutée.
      </p>
      <div class="file-scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Gravité</th>
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
      <p v-if="!treatedAlerts.length" class="empty">Aucune alerte traitée pour ces filtres.</p>
      </div>
    </details>
  </div>
</template>
