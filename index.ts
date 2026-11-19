import { Plugin } from "@opencode/plugin"
import { sendNotification } from "./notify"
import { playSound } from "./sound"
import { activateWindow, findWindow } from "./window"

export default Plugin.define({
  id: "local.native-notifications",
  async setup(ctx) {
    const controller = new AbortController()
    const notifications = new Map<string, { id: string; close: () => void }>()
    const completed = new Set<string>()
    const notify = async (sessionID: string, question = false) => {
      try {
        const session = await ctx.session.get({ sessionID })
        // Each Location has its own plugin instance, but events are server-wide.
        if (session.parentID || session.location.directory !== ctx.location.directory || session.location.workspaceID !== ctx.location.workspaceID) return
        const target = await findWindow(session.id)
        // Send through the desktop bus: OSC notifications do not work in Konsole.
        // The title is a literal summary argument, never shell-interpolated or body markup.
        for (const attempt of [0, 1, 2]) {
          if (controller.signal.aborted) break
          try {
            // Keep an independent action listener per banner. Replacing an old
            // notification would also leave its old listener attached to the new one.
            const delivered = await sendNotification(["--app-name=OpenCode", question ? "--icon=dialog-question" : "--icon=dialog-information", "--hint=boolean:transient:false", "--hint=boolean:suppress-sound:true", "--print-id", "--", (session.title?.trim() || session.id).replace(/[\r\n]/g, " "), question ? "Question needs input" : "Task completed"], controller.signal, target ? async () => {
              if (!await activateWindow(target)) console.info(`[Native Notifications] window activation unavailable session=${session.id}`)
            } : undefined)
            notifications.set(delivered.id, delivered)
            if (notifications.size > 256) {
              notifications.get(notifications.keys().next().value!)?.close()
              notifications.delete(notifications.keys().next().value!)
            }
            console.info(`[Native Notifications] delivered session=${session.id} notification=${delivered.id}`)
          } catch (error) {
            // Plasma rejects identical banners sent in quick succession, even replacements.
            if (String(error).includes("ExcessNotificationGeneration") && attempt < 2) {
              await Bun.sleep(1500)
              continue
            }
            throw error
          }
          // Play once after delivery, not once per retry or connected terminal.
          await playSound(question).catch((error) => console.warn("[Native Notifications] sound failed", error))
          break
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[Native Notifications] delivery failed", error)
      }
    }
    // V2 2.2.5 exposes question execution through tool hooks, not a public
    // question event. Deliver before entering the tool's wait for user input.
    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool === "question") await notify(event.sessionID, true)
    })
    // A successful execution can merely be yielding to background work. Only
    // model-work idle with no outstanding jobs qualifies as task completion.
    await ctx.session.hook("experimental.idle", (event) => {
      completed.delete(event.sessionID)
      if (!event.background.length) completed.add(event.sessionID)
    })
    // Another idle hook may admit input and continue this same execution.
    await ctx.session.hook("context", (event) => {
      completed.delete(event.sessionID)
    })
    void (async () => {
      for await (const event of ctx.event.subscribe({ types: ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted", "session.deleted"], signal: controller.signal })) {
        if (event.location?.workspaceID !== ctx.location.workspaceID) continue
        const ready = completed.delete(event.data.sessionID)
        if (event.type === "session.execution.succeeded" && ready) await notify(event.data.sessionID)
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.warn("[Native Notifications] subscription stopped", error)
    })
    return () => controller.abort()
  },
})
