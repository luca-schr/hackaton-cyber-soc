<script setup>
import { onMounted } from 'vue'
import { loadData, pendingCount, resetDemo, soc, startClock } from './store/soc'
import AgentPipeline from './components/AgentPipeline.vue'

onMounted(() => {
  startClock()
  loadData()
})
</script>

<template>
  <div class="shell">
    <aside class="nav">
      <div class="brand">
        <small>Checkout SAS</small>
        <strong>Smart Agentic SOC</strong>
      </div>
      <router-link to="/">Command Center</router-link>
      <router-link to="/inbox">Inbox <span v-if="pendingCount" class="nav-count">{{ pendingCount }}</span></router-link>
      <router-link to="/controle">Contrôle</router-link>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="meta">
          {{ soc.meta.environment || 'DEMO' }} · {{ soc.meta.llm }} · données simulées
        </div>
        <div class="pills">
          <span class="pill live">Live</span>
          <span class="pill demo">HITL requis</span>
          <span class="pill mono">{{ soc.clock }}</span>
        </div>
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
      title="Reset démo"
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
