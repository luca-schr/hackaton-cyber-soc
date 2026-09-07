<script setup>
import AgentLogs from '../components/AgentLogs.vue'
import { soc, stopPipeline } from '../store/soc'
</script>

<template>
  <div class="page">
    <h1>Contrôle · Agent 4 Scheduler</h1>
    <section class="panel">
      <div class="kv">
        <span>Planification</span><code>toutes les 15 s · retry 3x · backoff 2/4/8 s</code>
        <span>Source</span><code>data/alerts.json + cases.json + intel.json (BASE_URL)</code>
        <span>Scope actuel</span><code>{{ soc.config.source }} · {{ soc.config.mode }}</code>
        <span>LLM</span><code>{{ soc.meta.llm }} · aucune clé API · résultats pré-calculés</code>
        <span>Guardrail</span><code>PII filter {{ soc.config.maskPii ? 'ON' : 'OFF (forcé ON)' }} · auto-remediate OFF</code>
        <span>Fail securely</span><code>si pipeline stoppé → pas d’envoi de payload brut</code>
        <span>IoCs mock</span><code>{{ soc.intel.iocs?.length || 0 }} indicateurs · {{ soc.intel.keywords?.length || 0 }} mots-clés</code>
      </div>
      <div class="actions">
        <button class="btn primary" :disabled="soc.stopped" @click="stopPipeline">Stop pipeline</button>
      </div>
    </section>

    <section class="panel">
      <h2>Logs agents</h2>
      <AgentLogs :rows="soc.logs" :limit="20" />
    </section>

    <section class="panel">
      <h2>Tickets simulés cette session</h2>
      <p v-if="!soc.sentTickets.length" class="empty">Aucun envoi simulé pour l’instant.</p>
      <table v-else>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Case</th>
            <th>Horodatage</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in soc.sentTickets" :key="row.id">
            <td class="mono">{{ row.id }}</td>
            <td class="mono">{{ row.caseId }}</td>
            <td class="mono">{{ row.at }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
