<script setup>
import { useRouter } from 'vue-router'
import { ALERT_STATUS, SEV_LABEL } from '../labels'
import { bandFromScore } from '../data/architecture'
import KpiPie from '../components/KpiPie.vue'
import {
  clearDashSlice,
  dashTableMeta,
  dashboardWidgets,
  drillAlerts,
  soc,
  toggleDashSlice,
} from '../store/soc'

const router = useRouter()

function openAlert(alert) {
  if (!alert?.caseId) return
  router.push(`/cases/${alert.caseId}`)
}

function sliceOn(widgetId, key) {
  return soc.dashSlice?.widgetId === widgetId && soc.dashSlice?.key === key
}

function pickSlice(widget, key) {
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
          <select v-model="soc.config.source" :disabled="soc.running" @change="onSourceChange">
            <option>Tous</option>
            <option>GuardDuty</option>
            <option>WAF</option>
            <option>SIEM</option>
          </select>
        </div>
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
            <i :style="{ background: slice.color }"></i>
            {{ slice.label }}
            <span class="mono">{{ slice.n }}</span>
          </li>
        </ul>
      </article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>{{ dashTableMeta.title }} · {{ dashTableMeta.count }}</h2>
          <p class="meta">{{ dashTableMeta.hint }}</p>
        </div>
        <button v-if="soc.dashSlice" class="btn" type="button" @click="clearDashSlice">Tout voir</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Gravité</th>
            <th>Score</th>
            <th>Source</th>
            <th>Type</th>
            <th>Ressource</th>
            <th>Statut</th>
            <th>Reçu</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="alert in drillAlerts"
            :key="alert.id"
            class="clickable"
            :class="{ star: alert.star }"
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
