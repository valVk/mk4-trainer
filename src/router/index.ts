import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/Home.vue'),
    },
    {
      path: '/train',
      name: 'train',
      component: () => import('@/pages/Train.vue'),
    },
    {
      path: '/lab',
      name: 'lab',
      component: () => import('@/pages/Lab.vue'),
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('@/pages/Progress.vue'),
    },
    {
      path: '/pads',
      name: 'pads',
      component: () => import('@/pages/Pads.vue'),
    },
    {
      path: '/midi-test',
      name: 'midi-test',
      component: () => import('@/pages/MidiTest.vue'),
    },
  ],
})

export default router
