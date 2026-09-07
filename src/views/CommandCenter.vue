<script setup>
import { useRouter } from 'vue-router'
import AgentPipeline from '../components/AgentPipeline.vue'
import { SEV_LABEL } from '../labels'
import { launchWorkflow, liveKpis, queuedAlerts, soc } from '../store/soc'

const router = useRouter()

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
  router.push('/alerts')
}
</script>

<template>
  <div class="page">
    <div class="kpis">
      <article v-for="kpi in liveKpis" :key="kpi.label" class="kpi">
        <div class="label">{{ kpi.label }}</div>
        <div class="value mono">{{ kpi.value }}</div>
        <div class="hint">{{ kpi.hint }}</div>
      </article>
    </div>

    <section class="panel">
      <h2>Pipeline agents</h2>
      <AgentPipeline />
    </section>

    <section class="panel">
      <h2>Contrôle</h2>
      <div class="row">
        <div class="field">
          <label>Source</label>
          <select v-model="soc.config.source" :disabled="soc.running">
            <option>Tous</option>
            <option>GuardDuty</option>
            <option>WAF</option>
            <option>SIEM</option>
          </select>
        </div>
        <div class="field">
          <label>Mode</label>
          <select v-model="soc.config.mode" :disabled="soc.running">
            <option>Lot complet</option>
            <option>Alerte unique (prioritaire)</option>
          </select>
        </div>
        <label class="check">
          <input v-model="soc.config.maskPii" type="checkbox" />
          Masquer IP et données perso avant le LLM
        </label>
        <label class="check">
          <input type="checkbox" disabled />
          Remédiation auto (désactivée)
        </label>
        <button
          class="btn primary"
          :disabled="soc.running || soc.stopped || soc.launched || !soc.alerts.length"
          @click="launch"
        >
          {{ soc.running ? 'Exécution…' : soc.launched ? 'Déjà lancé' : 'Lancer le workflow' }}
        </button>
      </div>
    </section>

    <section class="panel">
      <h2>Alertes · {{ queuedAlerts.length }} dans le périmètre</h2>
      <table>
        <thead>
          <tr>
            <th>Sévérité</th>
            <th>Source</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alert in queuedAlerts" :key="alert.id" :class="{ star: alert.star }">
            <td class="sev" :class="alert.severity">{{ SEV_LABEL[alert.severity] || alert.severity }}</td>
            <td>{{ alert.source }}</td>
            <td>{{ alert.type }}</td>
            <td class="mono">{{ alert.asset }}</td>
            <td class="mono">{{ alert.receivedAt }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
