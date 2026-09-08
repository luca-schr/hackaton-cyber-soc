<script setup>
import { onMounted, watch } from 'vue'
import { launchWorkflow, loadData, loginDemo, pendingCount, resetDemo, soc, startClock, startIngest } from './store/soc'
import AgentClock from './components/AgentClock.vue'
import AgentPipeline from './components/AgentPipeline.vue'

onMounted(() => {
  startClock()
  loadData()
  if (soc.loggedIn) startIngest()
})

watch(
  () => soc.loggedIn,
  (on) => {
    if (on) startIngest()
  },
)

function launchAgents() {
  launchWorkflow()
}
</script>

<template>
  <div v-if="soc.bootstrapping" key="boot" class="boot-screen">
    <div class="boot-inner">
      <div class="brand">
        <small>Checkout SAS</small>
        <strong>Smart Agentic SOC</strong>
      </div>
      <div class="boot-bar" aria-hidden="true">
        <div class="boot-bar-fill"></div>
      </div>
      <p class="boot-label">{{ soc.bootLabel }}</p>
    </div>
  </div>

  <div v-else-if="!soc.loggedIn" key="login" class="login-screen">
    <form class="login-card" @submit.prevent="loginDemo">
      <div class="brand">
        <small>Checkout SAS</small>
        <strong>Smart Agentic SOC</strong>
      </div>
      <p class="meta">Console SOC · eu-west-1</p>
      <div class="field">
        <label>E-mail</label>
        <input type="email" value="l1.analyste@checkout.com" autocomplete="username" />
      </div>
      <div class="field">
        <label>Mot de passe</label>
        <input type="password" value="CheckoutSOC2026" autocomplete="current-password" />
      </div>
      <button class="btn primary login-btn" type="submit" :disabled="soc.loginBusy">
        <span v-if="soc.loginBusy" class="loader" aria-hidden="true"></span>
        {{ soc.loginBusy ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>
  </div>

  <div v-else key="shell" class="shell">
    <aside class="nav-side">
      <div class="brand">
        <small>Checkout SAS</small>
        <strong>Smart Agentic SOC</strong>
      </div>
      <nav class="nav">
        <router-link to="/">Dashboard</router-link>
        <router-link to="/alerts">
          Alerts
          <span v-if="pendingCount" class="nav-count">{{ pendingCount }}</span>
        </router-link>
        <router-link to="/logs">Logs</router-link>
        <router-link to="/control">Control</router-link>
      </nav>
    </aside>
    <div class="main">
      <div class="agent-bar" :class="{ 'is-run': soc.running || (soc.autopilot && !soc.stopped), 'is-ok': soc.launched && !soc.running && !soc.autopilot && !soc.stopped }">
        <AgentPipeline compact />
        <button
          class="btn primary agent-launch"
          type="button"
          :class="{ 'is-live': soc.autopilot && !soc.stopped }"
          :disabled="soc.running"
          title="Lancer ou relancer le pipeline"
          @click="launchAgents"
        >
          <span v-if="soc.autopilot && !soc.stopped" class="launch-spin" aria-hidden="true"></span>
          <svg v-else viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path fill="currentColor" d="M4.2 2.4v11.2L13.4 8 4.2 2.4z" />
          </svg>
          AI Workflow
        </button>
        <AgentClock />
      </div>
      <p v-if="soc.error" class="banner warn" style="margin: 10px 18px 0">{{ soc.error }}</p>
      <router-view />
    </div>
    <button
      class="fab-reset"
      type="button"
      title="Réinitialiser la session"
      :disabled="soc.running"
      @click="resetDemo"
    >
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.5a6.5 6.5 0 1 0 6.3 8.05h-1.54A5 5 0 1 1 8 3v2.25L11.5 3 8 .75V1.5z"
        />
      </svg>
    </button>
  </div>
</template>
