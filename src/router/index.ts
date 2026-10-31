import { createRouter, createWebHistory } from 'vue-router'

// meta.sound: the screen plays sound, so SoundGate asks to turn it on.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/Home.vue'),
    },
    {
      // One entry from Home: chords and theory are two separate places behind it.
      path: '/train',
      name: 'train',
      component: () => import('@/pages/TrainChoice.vue'),
    },
    {
      path: '/train/chords',
      name: 'train-chords',
      meta: { sound: true },
      component: () => import('@/pages/Train.vue'),
    },
    {
      path: '/train/theory',
      name: 'train-theory',
      component: () => import('@/pages/Theory.vue'),
    },
    {
      path: '/lab',
      name: 'lab',
      meta: { sound: true },
      component: () => import('@/pages/Lab.vue'),
    },
    {
      path: '/songs',
      name: 'songs',
      component: () => import('@/pages/Songs.vue'),
    },
    {
      path: '/songs/:id',
      name: 'song',
      meta: { sound: true },
      component: () => import('@/pages/Song.vue'),
    },
    {
      path: '/songs/:id/:channel',
      name: 'song-practice',
      meta: { sound: true },
      component: () => import('@/pages/SongPractice.vue'),
    },
    {
      path: '/rhythm',
      name: 'rhythm',
      component: () => import('@/pages/Rhythm.vue'),
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('@/pages/Progress.vue'),
    },
    {
      path: '/licenses',
      name: 'licenses',
      component: () => import('@/pages/Licenses.vue'),
    },
    {
      path: '/pads',
      name: 'pads',
      component: () => import('@/pages/Pads.vue'),
    },
    {
      path: '/midi-test',
      // The short address works too: the MK4 check is where its controls are found and mapped (plan step 25).
      alias: '/midi',
      name: 'midi-test',
      component: () => import('@/pages/MidiTest.vue'),
    },
    // Development only: the owner picks how the MK4 knob's place looks.
    ...(import.meta.env.DEV ? [{ path: '/dev/focus', name: 'dev-focus', component: () => import('@/pages/dev/FocusPlayground.vue') }] : []),
  ],
})

export default router
