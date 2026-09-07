<script setup>
import { soc, stopPipeline } from '../store/soc'
</script>

<template>
  <div class="page">
    <h1>Control · Agent 4 Planificateur</h1>
    <section class="panel">
      <div class="kv">
        <span>Planification</span><code>toutes les 15 s · 3 tentatives · délai 2/4/8 s</code>
        <span>Source</span>
        <code>{{ soc.alerts.length }} alertes simulées (GuardDuty · WAF · SIEM)</code>
        <span>Périmètre actuel</span><code>{{ soc.config.source }} · {{ soc.config.mode }}</code>
        <span>LLM</span><code>{{ soc.meta.llm }} · aucune clé API · résultats pré-calculés</code>
        <span>Garde-fou</span><code>filtre données perso {{ soc.config.maskPii ? 'activé' : 'désactivé (forcé activé)' }} · remédiation auto désactivée</code>
        <span>Échec sécurisé</span><code>si le pipeline est stoppé → aucun envoi de contenu brut</code>
      </div>
      <div class="actions">
        <button class="btn primary" :disabled="soc.stopped" @click="stopPipeline">Arrêter le pipeline</button>
      </div>
    </section>

    <section class="panel">
      <h2>Tickets simulés cette session</h2>
      <p v-if="!soc.sentTickets.length" class="empty">Aucun envoi simulé pour l’instant.</p>
      <table v-else>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Dossier</th>
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
