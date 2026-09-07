<script setup>
import AgentLogs from '../components/AgentLogs.vue'
import { soc } from '../store/soc'
</script>

<template>
  <div class="page">
    <h1>Logs · {{ soc.logs.length }} entrée(s)</h1>
    <section class="panel">
      <AgentLogs :rows="soc.logs" :limit="80" />
    </section>
  </div>
</template>
