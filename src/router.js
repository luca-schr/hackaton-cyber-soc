import { createRouter, createWebHashHistory } from 'vue-router'
import CommandCenter from './views/CommandCenter.vue'
import Inbox from './views/Inbox.vue'
import Logs from './views/Logs.vue'
import CaseLive from './views/CaseLive.vue'
import TicketL2 from './views/TicketL2.vue'
import Controle from './views/Controle.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: CommandCenter },
    { path: '/alerts', name: 'alerts', component: Inbox },
    { path: '/logs', name: 'logs', component: Logs },
    { path: '/control', name: 'control', component: Controle },
    { path: '/cases/:id', name: 'case', component: CaseLive },
    { path: '/tickets/:id', name: 'ticket', component: TicketL2 },
    { path: '/inbox', redirect: '/alerts' },
    { path: '/controle', redirect: '/control' },
    { path: '/historique', redirect: '/alerts' },
  ],
})

export default router
