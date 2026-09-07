<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { confirmL2Send, inspectTicket, playCase, soc } from '../store/soc'

const route = useRoute()
const copied = ref(false)
const item = computed(() => soc.cases[route.params.id])
const ticket = computed(() => item.value?.ticket)

async function syncTicket() {
  await playCase(route.params.id)
  inspectTicket(route.params.id)
}

function confirmSend() {
  if (!item.value?.played || item.value?.playing) return
  if (!confirmL2Send(route.params.id)) return
}

onMounted(syncTicket)
watch(() => route.params.id, syncTicket)

async function copyTicket() {
  if (!ticket.value || !item.value) return
  const text = [
    ticket.value.subject,
    `À : ${ticket.value.to}`,
    '',
    ticket.value.summary,
    '',
    `Source : ${item.value.alertId}`,
    `Ressource : ${item.value.masked.instanceId}`,
    `Indicateur : ${item.value.masked.ip}`,
    `Confiance : ${item.value.confidence} %`,
    '',
    'Actions recommandées (non exécutées) :',
    ...ticket.value.actions.map((action, index) => `${index + 1}. ${action}`),
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="page" v-if="ticket">
    <section class="panel ticket">
      <div class="pills" style="margin-bottom: 12px">
        <span class="pill" :style="{ color: 'var(--sev-crit)', borderColor: 'var(--sev-crit)' }">
          {{ ticket.priority }}
        </span>
        <span class="pill">{{ ticket.id }}</span>
        <span class="pill live" v-if="item.sent">E-mail L2 transmis</span>
        <span class="pill attention" v-else-if="item.playing">Analyse…</span>
        <span class="pill attention" v-else-if="item.played">Brouillon · non transmis</span>
      </div>
      <h1>{{ ticket.subject }}</h1>
      <p class="meta">À : {{ ticket.to }}</p>

      <h3>Résumé de l’attaque</h3>
      <p>{{ ticket.summary }}</p>

      <h3>Contexte</h3>
      <div class="kv">
        <span>Source</span><code>{{ item.alertId }}</code>
        <span>Ressource</span><code>{{ item.masked.instanceId }}</code>
        <span>Indicateur</span><code>{{ item.masked.ip }} · source interne</code>
        <span>Confiance</span><code>{{ item.confidence }} % · Bedrock EU · sans entraînement</code>
        <span>Dossier</span><code>{{ route.params.id }}</code>
      </div>

      <h3>Action recommandée (non exécutée)</h3>
      <ol>
        <li v-for="action in ticket.actions" :key="action">{{ action }}</li>
      </ol>

      <div class="actions">
        <button
          v-if="!item.sent"
          class="btn ok"
          :disabled="!item.played || item.playing"
          @click="confirmSend"
        >
          {{ item.playing ? 'Analyse…' : 'Confirmer l’envoi L2' }}
        </button>
        <button class="btn" @click="copyTicket">
          {{ copied ? 'Ticket copié' : 'Copier le ticket' }}
        </button>
        <router-link class="btn" :to="`/cases/${route.params.id}`">Retour au dossier</router-link>
      </div>
    </section>
  </div>
  <div class="page" v-else>
    <p class="empty">Pas de ticket L2 pour ce dossier (faux positif ou dossier incomplet).</p>
    <router-link class="btn" to="/alerts">Alerts</router-link>
  </div>
</template>
