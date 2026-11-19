import { homedir } from "node:os"
import path from "node:path"
import { desktopRuntimeDirectory } from "./runtime"

export async function playSound(question: boolean) {
  const event = question ? "dialog-question" : "message-new-instant"
  const dirs = [process.env.XDG_DATA_HOME || path.join(homedir(), ".local/share"),
    ...(process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":")]
  for (const dir of dirs.filter((dir) => path.isAbsolute(dir))) {
    const file = path.join(dir, "sounds/ocean/stereo", `${event}.oga`)
    if (!await Bun.file(file).exists()) continue
    // The systemd service can start before login and does not have GTK display
    // credentials. PulseAudio/PipeWire only needs the login runtime socket.
    const child = Bun.spawn(["paplay", "--client-name=OpenCode", file], {
      stdout: "ignore", stderr: "pipe", timeout: 5000,
      env: { ...process.env, XDG_RUNTIME_DIR: desktopRuntimeDirectory() },
    })
    const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
    if (code !== 0) throw new Error(`paplay exited ${code}: ${error.trim()}`)
    return
  }
  throw new Error(`Ocean sound not found: ${event}.oga`)
}
