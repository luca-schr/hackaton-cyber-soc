<script setup>
import { useRouter } from 'vue-router'
import { soc, stopPipeline } from '../store/soc'

const router = useRouter()

function openTicket(row) {
  router.push(`/tickets/${row.caseId}`)
}
</script>

<template>
  <div class="page">
    <h1>Control · Agent 4 Planificateur</h1>
    <section class="panel">
      <div class="kv">
        <span>Source</span>
        <code>{{ soc.alerts.length }} alertes · GuardDuty · WAF · SIEM</code>
        <span>Périmètre</span><code>{{ soc.config.source }}</code>
        <span>LLM</span><code>{{ soc.meta.llm }} · résidence EU · sans entraînement</code>
        <span>Garde-fou</span><code>données perso {{ soc.config.maskPii ? 'masquées' : 'masquage forcé' }} · remédiation auto off</code>
        <span>Échec sécurisé</span><code>pipeline stoppé → aucun contenu brut envoyé</code>
      </div>
      <div class="actions">
        <button class="btn primary" :disabled="soc.stopped" @click="stopPipeline">Arrêter le pipeline</button>
      </div>
    </section>

    <section class="panel">
      <h2>Tickets L2 cette session</h2>
      <p v-if="!soc.sentTickets.length" class="empty">Aucun ticket L2 transmis pour l’instant.</p>
      <table v-else>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Dossier</th>
            <th>Horodatage</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in soc.sentTickets"
            :key="row.id"
            class="clickable"
            @click="openTicket(row)"
          >
            <td class="mono">{{ row.id }}</td>
            <td class="mono">{{ row.caseId }}</td>
            <td class="mono">{{ row.at }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
