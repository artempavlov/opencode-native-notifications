export function sendNotification(args: string[], signal: AbortSignal, action?: () => Promise<unknown>) {
  const result = Promise.withResolvers<{ id: string; close: () => void }>()
  const child = Bun.spawn(["notify-send", ...(action ? ["--action=default=Show window"] : []), ...args], { stdout: "pipe", stderr: "pipe" })
  const errors = new Response(child.stderr).text()
  const close = () => { child.kill() }
  signal.addEventListener("abort", close, { once: true })
  const timer = setTimeout(() => { close(); result.reject(new Error("notify-send delivery timed out")) }, 5000)
  void (async () => {
    const decoder = new TextDecoder()
    const state = { buffer: "", delivered: false, clicked: false }
    try {
      for await (const chunk of child.stdout) {
        state.buffer += decoder.decode(chunk, { stream: true })
        while (state.buffer.includes("\n")) {
          const line = state.buffer.slice(0, state.buffer.indexOf("\n")).trim()
          state.buffer = state.buffer.slice(state.buffer.indexOf("\n") + 1)
          if (!state.delivered) {
            clearTimeout(timer)
            if (!/^[1-9]\d*$/.test(line)) {
              close()
              throw new Error(await errors || "notify-send returned no notification ID")
            }
            state.delivered = true
            result.resolve({ id: line, close })
          } else if (line === "default" && !state.clicked && !signal.aborted) {
            state.clicked = true
            await action?.()
          }
        }
      }
      const code = await child.exited
      if (!state.delivered) throw new Error(`notify-send exited ${code}: ${(await errors).trim()}`)
    } catch (error) {
      result.reject(error)
      if (state.delivered && !signal.aborted) console.warn("[Native Notifications] click failed", error)
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", close)
    }
  })()
  if (signal.aborted) close()
  return result.promise
}
