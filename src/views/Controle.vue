<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AGENT_STATUS } from '../labels'
import { ARCH_AGENTS, SCORE_BANDS } from '../data/architecture'
import { soc, stopPipeline } from '../store/soc'

const router = useRouter()
const workflowOn = computed(() => soc.launched || soc.running)

function openTicket(row) {
  router.push(`/tickets/${row.caseId}`)
}

function liveStatus(ids) {
  const rows = soc.agents.filter((agent) => ids.includes(agent.id))
  if (rows.some((agent) => agent.status === 'RUN' || agent.status === 'WAIT')) return 'RUN'
  if (rows.some((agent) => agent.status === 'STOP')) return 'STOP'
  if (rows.length && rows.every((agent) => agent.status === 'OK')) return 'OK'
  return rows[0]?.status || 'IDLE'
}
</script>

<template>
  <div class="page">
    <h1>{{ workflowOn ? 'Control, pipeline agents' : 'Control, politique SOC' }}</h1>

    <div class="banner" v-if="!soc.launched && !soc.running">
      Workflow IA inactif. Diagnostic L1 manuel. Lancez AI Workflow dans la barre.
    </div>
    <div class="banner warn" v-else-if="soc.running">
      Agents en cours. Masquage A1, score A2, ticket A3 propose. Isolation non executee.
    </div>
    <div class="banner" v-else-if="soc.stopped">
      Pipeline arrete. Aucun contenu brut envoye.
    </div>
    <div class="banner" v-else>
      Workflow IA termine. Tickets L2 envoyes. Isolation non executee.
    </div>

    <section class="panel">
      <h2>Agents</h2>
      <p class="meta" style="margin: 0 0 8px">
        Quatre agents, un workflow controle. L2 valide toute action a impact.
      </p>
      <div class="agent-grid">
        <article
          v-for="agent in ARCH_AGENTS"
          :key="agent.n"
          class="agent-card"
          :class="{
            'is-run': liveStatus(agent.ids) === 'RUN',
            'is-ok': liveStatus(agent.ids) === 'OK',
          }"
        >
          <div class="agent-card-head">
            <strong>{{ agent.n }} {{ agent.label }}</strong>
            <span class="status" :class="'status-' + liveStatus(agent.ids)">
              {{ AGENT_STATUS[liveStatus(agent.ids)] || liveStatus(agent.ids) }}
            </span>
          </div>
          <div class="pills" style="margin: 8px 0 0">
            <span v-for="model in agent.models" :key="model" class="pill model-badge">{{ model }}</span>
          </div>
          <p>{{ agent.task }}</p>
          <div class="kv">
            <span>Entree</span>
            <code>{{ agent.input }}</code>
            <span>Sortie</span>
            <code>{{ agent.output }}</code>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>Decision, assessment score</h2>
      <p class="meta" style="margin: 0 0 8px">
        A2 combine gravite, criticite d actif, repetition et preuves. Le score fixe la priorite du ticket, jamais une action systeme.
      </p>
      <div class="band-grid">
        <article v-for="band in SCORE_BANDS" :key="band.range" class="band-card">
          <div class="label">{{ band.range }} {{ band.label }}</div>
          <p>{{ band.action }}</p>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>Garde-fous</h2>
      <div class="kv">
        <span>Region</span>
        <code>eu-west-1, modeles Bedrock autorises, sans entrainement public</code>
        <span>Masquage</span>
        <code>{{ soc.config.maskPii ? 'Payloads masques avant LLM (A1)' : 'Masquage operateur off, garde-fou A1 force' }}</code>
        <span>Remediation</span>
        <code>Auto desactivee. Isoler, bloquer, supprimer: L2 uniquement</code>
        <span>Echec securise</span>
        <code>Stop humain: aucun contenu brut envoye (shadow mode)</code>
      </div>
      <div class="row" style="margin-top: 10px">
        <label class="check">
          <input v-model="soc.config.maskPii" type="checkbox" :disabled="soc.running" />
          Masquer IP et donnees perso avant le LLM
        </label>
      </div>
      <div class="actions">
        <button
          class="btn primary"
          :disabled="!workflowOn || soc.stopped"
          @click="stopPipeline"
        >
          Arreter le pipeline
        </button>
      </div>
    </section>

    <section class="panel">
      <h2>Tickets L2 cette session</h2>
      <p v-if="!workflowOn" class="empty">
        Pas de tickets A3 tant que AI Workflow n a pas tourne.
      </p>
      <p v-else-if="!soc.sentTickets.length" class="empty">Aucun ticket L2 transmis pour l instant.</p>
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
