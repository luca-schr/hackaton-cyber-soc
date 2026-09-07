<script setup>
import { onMounted } from 'vue'
import { loadData, pendingCount, soc, startClock } from './store/soc'

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
      <p v-if="soc.error" class="banner warn" style="margin: 16px 24px 0">{{ soc.error }}</p>
      <router-view />
    </div>
  </div>
</template>
