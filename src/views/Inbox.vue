<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { soc } from '../store/soc'

const router = useRouter()
const severity = ref('ALL')
const source = ref('ALL')
const resource = ref('ALL')
const status = ref('ALL')
const selectedId = ref('GD-8841')

const sources = computed(() => ['ALL', ...new Set(soc.alerts.map((a) => a.source))])
const resources = computed(() => ['ALL', ...new Set(soc.alerts.map((a) => a.resourceType))])

const filtered = computed(() =>
  soc.alerts.filter((alert) => {
    if (severity.value !== 'ALL' && alert.severity !== severity.value) return false
    if (source.value !== 'ALL' && alert.source !== source.value) return false
    if (resource.value !== 'ALL' && alert.resourceType !== resource.value) return false
    if (status.value !== 'ALL' && alert.status !== status.value) return false
    return true
  }),
)

const selected = computed(
  () => soc.alerts.find((alert) => alert.id === selectedId.value) || filtered.value[0],
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
    <h1>Inbox · {{ filtered.length }} alertes</h1>
    <div v-if="!soc.launched" class="banner">
      Lancez le workflow depuis le Command Center pour simuler l’ingestion.
    </div>

    <section class="panel">
      <div class="row">
        <div class="field">
          <label>Sévérité</label>
          <select v-model="severity">
            <option>ALL</option>
            <option>CRITICAL</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </div>
        <div class="field">
          <label>Source</label>
          <select v-model="source">
            <option v-for="item in sources" :key="item">{{ item }}</option>
          </select>
        </div>
        <div class="field">
          <label>Ressource</label>
          <select v-model="resource">
            <option v-for="item in resources" :key="item">{{ item }}</option>
          </select>
        </div>
        <div class="field">
          <label>Statut</label>
          <select v-model="status">
            <option>ALL</option>
            <option value="new">new</option>
            <option value="ready">ready</option>
            <option value="awaiting_l2">awaiting_l2</option>
            <option value="escalated">escalated</option>
            <option value="false_positive">false_positive</option>
            <option value="ignored">ignored</option>
            <option value="closed">closed</option>
          </select>
        </div>
      </div>
    </section>

    <div class="split">
      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Asset</th>
              <th>Score</th>
              <th>Statut</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="alert in filtered"
              :key="alert.id"
              class="clickable"
              :class="{ selected: selected?.id === alert.id, star: alert.star }"
              @click="selectedId = alert.id"
            >
              <td class="mono">{{ alert.id }}</td>
              <td>
                <div class="sev" :class="alert.severity">{{ alert.severity }}</div>
                {{ alert.type }}
              </td>
              <td class="mono">{{ alert.asset }}</td>
              <td class="mono">{{ alert.score }}</td>
              <td class="mono">{{ alert.status }}</td>
              <td>{{ alert.agentLabel }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filtered.length" class="empty">Aucun résultat pour ces filtres.</p>
      </section>

      <aside class="panel" v-if="selected">
        <h2>{{ selected.id }}</h2>
        <div class="kv" v-if="selectedCase">
          <span>IP source</span>
          <code>{{ selectedCase.masked.ip }} · déjà masquée</code>
          <span>User-Agent</span>
          <code>{{ selectedCase.masked.userAgent }}</code>
          <span>Compte AWS</span>
          <code>{{ selectedCase.masked.accountId }}</code>
          <span>Région</span>
          <code>{{ selectedCase.masked.region }}</code>
          <span>IoC / intel</span>
          <code>{{ (selectedCase.intel?.hits || []).join(' · ') || 'aucun match' }}</code>
          <span>Case</span>
          <code>{{ selected.caseId }}</code>
        </div>
        <p v-else class="empty">Pas de dossier détaillé (JSON case absent).</p>
        <div class="actions">
          <button class="btn primary" :disabled="!selectedCase" @click="openCase">
            Ouvrir le case live
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>
