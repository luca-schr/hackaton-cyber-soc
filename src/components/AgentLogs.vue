<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  limit: { type: Number, default: 10 },
})
</script>

<template>
  <div class="logs">
    <div v-for="row in rows.slice(0, limit)" :key="row.id" class="log-line" :class="'log-' + row.level">
      <span class="mono">{{ row.time }}</span>
      <span class="log-agent">{{ row.agent }}</span>
      <span>{{ row.message }}</span>
    </div>
    <p v-if="!rows.length" class="empty">Aucun log agent pour l’instant.</p>
  </div>
</template>
