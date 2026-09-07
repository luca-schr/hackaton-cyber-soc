<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AgentLogs from '../components/AgentLogs.vue'
import { launchWorkflow, queuedAlerts, resetDemo, soc } from '../store/soc'

const router = useRouter()
const preview = computed(() => queuedAlerts.value.slice(0, 4))

async function launch() {
  await launchWorkflow()
  if (soc.stopped) return
  if (soc.config.mode.includes('unique')) {
    const star = soc.alerts.find((alert) => alert.star)
    if (star) {
      router.push(`/cases/${star.caseId}`)
      return
    }
  }
  router.push('/inbox')
}
</script>

<template>
  <div class="page">
    <div class="kpis">
      <article class="kpi">
        <div class="label">Alertes 24h</div>
        <div class="value mono">{{ soc.kpis.alerts24h?.toLocaleString('fr-FR') }}</div>
        <div class="hint">GuardDuty · WAF · SIEM</div>
      </article>
      <article class="kpi">
        <div class="label">Faux positifs L1</div>
        <div class="value mono">{{ soc.kpis.falsePositiveL1Pct }} %</div>
        <div class="hint">fatigue d’alerte estimée</div>
      </article>
      <article class="kpi">
        <div class="label">MTTD</div>
        <div class="value mono">{{ soc.kpis.mttdMinutes }} min</div>
        <div class="hint">vs {{ soc.kpis.mttdBeforeMinutes }} min avant</div>
      </article>
      <article class="kpi">
        <div class="label">Escalades L2</div>
        <div class="value mono">{{ soc.kpis.escalationsL2 }}</div>
        <div class="hint">jamais d’auto-exécution</div>
      </article>
    </div>

    <section class="panel">
      <h2>Pipeline agents</h2>
      <div class="pipeline">
        <div v-for="agent in soc.agents" :key="agent.id" class="agent">
          <div class="name">{{ agent.label }}</div>
          <div class="status" :class="'status-' + agent.status">{{ agent.status }}</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Contrôle</h2>
      <div class="row">
        <div class="field">
          <label>Source</label>
          <select v-model="soc.config.source" :disabled="soc.running">
            <option>Tous JSON</option>
            <option>GuardDuty JSON</option>
            <option>WAF JSON</option>
            <option>SIEM JSON</option>
          </select>
        </div>
        <div class="field">
          <label>Mode</label>
          <select v-model="soc.config.mode" :disabled="soc.running">
            <option>Batch 10 alertes</option>
            <option>Alerte unique (star)</option>
          </select>
        </div>
        <label class="check">
          <input v-model="soc.config.maskPii" type="checkbox" />
          Masquer IP / PII avant LLM
        </label>
        <label class="check">
          <input type="checkbox" disabled />
          Auto-remediate (OFF)
        </label>
        <button class="btn primary" :disabled="soc.running || soc.stopped || soc.launched" @click="launch">
          {{ soc.running ? 'Exécution…' : soc.launched ? 'Déjà lancé' : 'Lancer le workflow' }}
        </button>
        <button class="btn" :disabled="soc.running" @click="resetDemo">Reset démo</button>
      </div>
    </section>

    <section class="panel">
      <h2>File d’attente · {{ queuedAlerts.length }} dans le scope</h2>
      <table>
        <thead>
          <tr>
            <th>Sévérité</th>
            <th>Source</th>
            <th>Type</th>
            <th>Asset</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alert in preview" :key="alert.id" :class="{ star: alert.star }">
            <td class="sev" :class="alert.severity">{{ alert.severity }}</td>
            <td>{{ alert.source }}</td>
            <td>{{ alert.type }}</td>
            <td class="mono">{{ alert.asset }}</td>
            <td class="mono">{{ alert.receivedAt }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Logs agents</h2>
      <AgentLogs :rows="soc.logs" :limit="8" />
    </section>
  </div>
</template>
