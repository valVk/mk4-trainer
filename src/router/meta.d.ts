import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** The screen plays sound: SoundGate asks to turn it on. */
    sound?: boolean
  }
}
