<script setup>
import { AGENT_STATUS } from '../labels'
import { currentAgent, soc } from '../store/soc'

defineProps({
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div>
    <div class="pipeline" :class="{ compact }">
      <div
        v-for="agent in soc.agents"
        :key="agent.id"
        class="agent"
        :class="{
          'is-run': agent.status === 'RUN' || agent.status === 'WAIT',
          'is-ok': agent.status === 'OK',
        }"
      >
        <div class="name">{{ agent.n }} · {{ agent.label }}</div>
        <div class="status" :class="'status-' + agent.status">
          {{ AGENT_STATUS[agent.status] || agent.status }}
        </div>
        <div v-if="!compact" class="task">{{ agent.task }}</div>
      </div>
    </div>
    <p v-if="compact && currentAgent" :key="currentAgent.id" class="pipeline-now">
      En cours · {{ currentAgent.n }} {{ currentAgent.label }} — {{ currentAgent.task }}
    </p>
  </div>
</template>
