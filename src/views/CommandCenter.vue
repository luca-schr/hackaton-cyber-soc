<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ALERT_STATUS, SEV_LABEL } from '../labels'
import { bandFromScore } from '../data/architecture'
import KpiPie from '../components/KpiPie.vue'
import {
  LIST_LIMIT,
  clearDashSlice,
  dashTableMeta,
  dashboardWidgets,
  drillAlerts,
  soc,
  toggleDashSlice,
} from '../store/soc'

const router = useRouter()

const visibleAlerts = computed(() => drillAlerts.value.slice(0, LIST_LIMIT))

function openAlert(alert) {
  if (!alert?.caseId) return
  router.push(`/cases/${alert.caseId}`)
}

function sliceOn(widgetId, key) {
  if (widgetId === 'source' && key === 'all') {
    return !soc.dashSlice || soc.dashSlice.widgetId !== 'source'
  }
  return soc.dashSlice?.widgetId === widgetId && soc.dashSlice?.key === key
}

function pickSlice(widget, key) {
  if (widget.id === 'source' && key === 'all') {
    if (soc.dashSlice?.widgetId === 'source') clearDashSlice()
    return
  }
  const slice = widget.slices?.find((item) => item.key === key)
  if (slice && slice.n === 0) return
  toggleDashSlice(widget.id, key)
}

function pickDefault(widget) {
  if (!widget.defaultKey) return
  pickSlice(widget, widget.defaultKey)
}

function onSourceChange() {
  clearDashSlice()
}

function scoreText(alert) {
  const band = bandFromScore(alert.score)
  return `${alert.score} ${band.label}`
}
</script>

<template>
  <div class="page">
    <section class="panel filters">
      <div class="row">
        <div class="field">
          <label>Périmètre</label>
          <select v-model="soc.config.source" @change="onSourceChange">
            <option>Tous</option>
            <option>GuardDuty</option>
            <option>WAF</option>
            <option>SIEM</option>
          </select>
        </div>
        <div class="pills" style="align-self: end; padding-bottom: 2px">
          <span class="pill live" v-if="soc.ingestOn">Flux</span>
          <span class="pill live" v-if="soc.autopilot && !soc.stopped">AI live</span>
        </div>
        <p v-if="soc.lastArrival" class="meta" style="align-self: end; margin: 0 0 4px">
          Dernière · {{ soc.lastArrival.id }} · {{ soc.lastArrival.source }} · {{ soc.lastArrival.asset }} · {{ soc.lastArrival.at }}
        </p>
      </div>
    </section>

    <div class="kpis kpis-4">
      <article
        v-for="widget in dashboardWidgets"
        :key="widget.id"
        class="kpi kpi-chart"
        :class="{ 'is-on': soc.dashSlice?.widgetId === widget.id }"
      >
        <div class="label">{{ widget.label }}</div>
        <div class="kpi-body">
          <button class="kpi-donut-btn" type="button" @click="pickDefault(widget)">
            <KpiPie
              :slices="widget.slices"
              :value="widget.value"
              :active-key="soc.dashSlice?.widgetId === widget.id ? soc.dashSlice.key : ''"
            />
          </button>
          <ul class="kpi-legend">
            <li
              v-for="slice in widget.slices"
              :key="slice.key"
              :class="{
                'is-on': sliceOn(widget.id, slice.key),
                'is-zero': slice.n === 0,
              }"
              @click="pickSlice(widget, slice.key)"
            >
              <span class="kpi-legend-pin">
                <i :style="{ background: slice.color }"></i>
                {{ slice.label }}
              </span>
              <span class="mono">{{ slice.n }}</span>
            </li>
          </ul>
        </div>
      </article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>{{ dashTableMeta.title }}</h2>
          <p class="meta">{{ dashTableMeta.hint }}</p>
        </div>
        <button class="btn" type="button" @click="router.push('/alerts')">Tout voir</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Gravité</th>
            <th>Priorité A2</th>
            <th>Source</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Statut</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="alert in visibleAlerts"
            :key="alert.id"
            class="clickable"
            :class="{ fresh: alert.fresh }"
            @click="openAlert(alert)"
          >
            <td class="mono">{{ alert.id }}</td>
            <td class="sev" :class="alert.severity">{{ SEV_LABEL[alert.severity] || alert.severity }}</td>
            <td class="mono">{{ scoreText(alert) }}</td>
            <td>{{ alert.source }}</td>
            <td>{{ alert.type }}</td>
            <td class="mono">{{ alert.asset }}</td>
            <td>{{ ALERT_STATUS[alert.status] || alert.status }}</td>
            <td class="mono">{{ alert.receivedAt }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!drillAlerts.length" class="empty">Aucun dossier pour ce filtre.</p>
    </section>
  </div>
</template>
