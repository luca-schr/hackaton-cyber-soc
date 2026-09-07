import { createRouter, createWebHashHistory } from 'vue-router'
import CommandCenter from './views/CommandCenter.vue'
import Inbox from './views/Inbox.vue'
import CaseLive from './views/CaseLive.vue'
import TicketL2 from './views/TicketL2.vue'
import Controle from './views/Controle.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: CommandCenter },
    { path: '/inbox', name: 'inbox', component: Inbox },
    { path: '/cases/:id', name: 'case', component: CaseLive },
    { path: '/tickets/:id', name: 'ticket', component: TicketL2 },
    { path: '/controle', name: 'controle', component: Controle },
  ],
})

export default router
