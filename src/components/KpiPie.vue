<script setup>
import { computed } from 'vue'

const props = defineProps({
  slices: { type: Array, default: () => [] },
  value: { type: String, default: '' },
  activeKey: { type: String, default: '' },
})

const R = 13.9
const C = 2 * Math.PI * R

const arcs = computed(() => {
  const sum = props.slices
    .filter((slice) => !slice.skipPie)
    .reduce((total, slice) => total + slice.n, 0) || 1
  let offset = C / 4
  return props.slices
    .filter((slice) => slice.n > 0 && !slice.skipPie)
    .map((slice) => {
      const len = (slice.n / sum) * C
      const arc = {
        key: slice.key,
        color: slice.color,
        dash: `${len} ${C - len}`,
        offset,
      }
      offset -= len
      return arc
    })
})
</script>

<template>
  <div class="kpi-donut">
    <svg class="kpi-pie" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="kpi-pie-track" cx="18" cy="18" :r="R" fill="none" />
      <circle
        v-for="arc in arcs"
        :key="arc.key"
        cx="18"
        cy="18"
        :r="R"
        fill="none"
        :stroke="arc.color"
        :stroke-dasharray="arc.dash"
        :stroke-dashoffset="arc.offset"
        :class="{ dim: activeKey && activeKey !== arc.key }"
      />
    </svg>
    <div class="kpi-pie-value mono">{{ value }}</div>
  </div>
</template>
