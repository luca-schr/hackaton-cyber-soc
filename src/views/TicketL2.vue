<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { simulateSend, soc } from '../store/soc'

const route = useRoute()
const copied = ref(false)
const item = computed(() => soc.cases[route.params.id])
const ticket = computed(() => item.value?.ticket)

async function copyTicket() {
  if (!ticket.value || !item.value) return
  const text = [
    ticket.value.subject,
    `À : ${ticket.value.to}`,
    '',
    ticket.value.summary,
    '',
    `Source : ${item.value.alertId}`,
    `Asset : ${item.value.masked.instanceId}`,
    `IoC : ${item.value.masked.ip}`,
    `Confiance : ${item.value.confidence}%`,
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
        <span class="pill" :style="{ color: 'var(--crit)', borderColor: '#7f1d1d' }">
          {{ ticket.priority }}
        </span>
        <span class="pill">{{ ticket.id }}</span>
        <span class="pill" v-if="item.sent">Envoyé (simulé)</span>
      </div>
      <h1>{{ ticket.subject }}</h1>
      <p class="meta">À : {{ ticket.to }}</p>

      <h3>Résumé de l’attaque</h3>
      <p>{{ ticket.summary }}</p>

      <h3>Contexte</h3>
      <div class="kv">
        <span>Source</span><code>{{ item.alertId }}</code>
        <span>Asset</span><code>{{ item.masked.instanceId }}</code>
        <span>IoC</span><code>{{ item.masked.ip }} · feed interne</code>
        <span>Confiance</span><code>{{ item.confidence }}% · Bedrock EU · no-train</code>
        <span>Case</span><code>{{ route.params.id }}</code>
      </div>

      <h3>Action recommandée (non exécutée)</h3>
      <ol>
        <li v-for="action in ticket.actions" :key="action">{{ action }}</li>
      </ol>

      <div class="actions">
        <button class="btn primary" :disabled="item.sent" @click="simulateSend(route.params.id)">
          {{ item.sent ? 'Email simulé' : 'Simuler envoi email' }}
        </button>
        <button class="btn" @click="copyTicket">
          {{ copied ? 'Ticket copié' : 'Copier le ticket' }}
        </button>
        <router-link class="btn" :to="`/cases/${route.params.id}`">Retour case</router-link>
      </div>
    </section>
  </div>
  <div class="page" v-else>
    <p class="empty">Pas de ticket L2 pour ce case (faux positif ou dossier incomplet).</p>
    <router-link class="btn" to="/inbox">Inbox</router-link>
  </div>
</template>
