<script setup>
import { onMounted } from 'vue'
import { loadData, loginDemo, pendingCount, resetDemo, soc, startClock } from './store/soc'
import AgentPipeline from './components/AgentPipeline.vue'

onMounted(() => {
  startClock()
  loadData()
})
</script>

<template>
  <div v-if="soc.bootstrapping" class="boot-screen">
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

  <div v-else-if="!soc.loggedIn" class="login-screen">
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

  <div v-else class="shell">
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
      <header class="topbar">
        <span class="pill mono">{{ soc.clock }}</span>
      </header>
      <div class="agent-bar">
        <AgentPipeline compact />
      </div>
      <p v-if="soc.error" class="banner warn" style="margin: 16px 24px 0">{{ soc.error }}</p>
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
