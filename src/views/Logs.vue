<script setup>
import AgentLogs from '../components/AgentLogs.vue'
import { soc } from '../store/soc'
</script>

<template>
  <div class="page">
    <h1>Logs · {{ soc.logs.length }} entrée(s)</h1>
    <div class="pills" style="margin: 0 0 10px">
      <span class="pill log-key arrival">Arrivée</span>
      <span class="pill log-key treat">Traitement</span>
      <span class="pill log-key warn">Alerte / arrêt</span>
    </div>
    <section class="panel">
      <AgentLogs :rows="soc.logs" :limit="80" />
    </section>
  </div>
</template>
