<script setup>
import { useRouter } from 'vue-router'
import { SEV_LABEL } from '../labels'
import { attentionAlerts, launchWorkflow, liveKpis, queuedAlerts, soc } from '../store/soc'

const router = useRouter()

async function launch() {
  await launchWorkflow()
  if (soc.stopped) return
  router.push('/alerts')
}

function openAlert(alert) {
  if (!alert?.caseId) return
  router.push(`/cases/${alert.caseId}`)
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
      <h2>À traiter en priorité · {{ attentionAlerts.length }}</h2>
      <p class="meta" style="margin: -4px 0 12px">HIGH · CRITICAL — le LLM rédige le ticket, L1 confirme l’envoi</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Sévérité</th>
            <th>Source</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="alert in attentionAlerts"
            :key="alert.id"
            class="clickable"
            :class="{ star: alert.star }"
            @click="openAlert(alert)"
          >
            <td class="mono">{{ alert.id }}</td>
            <td class="sev" :class="alert.severity">{{ SEV_LABEL[alert.severity] || alert.severity }}</td>
            <td>{{ alert.source }}</td>
            <td>{{ alert.type }}</td>
            <td class="mono">{{ alert.asset }}</td>
            <td class="mono">{{ alert.receivedAt }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!attentionAlerts.length" class="empty">Aucune alerte haute priorité dans le périmètre.</p>
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
            <th>ID</th>
            <th>Sévérité</th>
            <th>Source</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="alert in queuedAlerts"
            :key="alert.id"
            class="clickable"
            :class="{ star: alert.star }"
            @click="openAlert(alert)"
          >
            <td class="mono">{{ alert.id }}</td>
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
