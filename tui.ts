import { Plugin } from "@opencode/plugin/tui"
import { removeBinding, writeBinding } from "./window"

export default Plugin.define({
  id: "local.native-notifications.tui",
  setup(ctx) {
    const bus = process.env.KONSOLE_DBUS_SERVICE
    const window = process.env.KONSOLE_DBUS_WINDOW
    if (!bus || !window || !process.env.DISPLAY) return
    const identity = { pid: process.pid, token: crypto.randomUUID(), bus, window }
    const seen = new Set<string>()
    const state = { stopped: false, last: "", pending: Promise.resolve() }
    const update = () => {
      const route = ctx.ui.router.current()
      const active = route.type === "session" ? route.sessionID : undefined
      // Tab lists are shared across clients. Claim only sessions actually viewed
      // in this client, and remember them when the user switches tabs/Locations.
      if (active) seen.add(active)
      const sessions = [...seen]
      const signature = JSON.stringify({ active, sessions })
      if (state.last === signature || state.stopped) return
      state.last = signature
      state.pending = state.pending.then(async () => {
        if (!state.stopped) await writeBinding({ ...identity, sessions, active, updated: Date.now() })
      }).catch((error) => console.warn("[Native Notifications] window registration failed", error))
    }
    update()
    const timer = setInterval(update, 500)
    const stop = ctx.data.on("session.execution.started", update)
    return () => {
      state.stopped = true
      clearInterval(timer)
      stop()
      void state.pending.then(() => removeBinding(identity))
    }
  },
})
