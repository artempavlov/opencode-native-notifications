import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { desktopRuntimeDirectory } from "./runtime"

export type WindowBinding = {
  pid: number
  token: string
  bus: string
  window: string
  sessions: string[]
  active?: string
  updated: number
}

export function bindingsDirectory() {
  return path.join(desktopRuntimeDirectory(), "opencode-native-notifications")
}

export async function writeBinding(binding: WindowBinding) {
  await mkdir(bindingsDirectory(), { recursive: true, mode: 0o700 })
  const file = path.join(bindingsDirectory(), `${binding.pid}-${binding.token}.json`)
  await writeFile(`${file}.next`, JSON.stringify(binding), { mode: 0o600 })
  await rename(`${file}.next`, file)
}

export async function removeBinding(binding: Pick<WindowBinding, "pid" | "token">) {
  await unlink(path.join(bindingsDirectory(), `${binding.pid}-${binding.token}.json`)).catch(() => {})
}

export function bindingAlive(binding: WindowBinding) {
  try {
    process.kill(binding.pid, 0)
    return true
  } catch {
    return false
  }
}

export async function findWindow(sessionID: string) {
  const files = await readdir(bindingsDirectory()).catch(() => [])
  const bindings = await Promise.all(files.filter((file) => /^\d+-[\da-f-]+\.json$/.test(file)).map(async (file) => {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(bindingsDirectory(), file), "utf8"))
      if (!value || typeof value !== "object") return
      const item = value as WindowBinding
      if (!Number.isSafeInteger(item.pid) || item.pid < 1 || !/^[\da-f-]+$/.test(item.token) || file !== `${item.pid}-${item.token}.json` || !/^:[\d.]+$/.test(item.bus) || !/^\/Windows\/\d+$/.test(item.window) || !Array.isArray(item.sessions) || !Number.isFinite(item.updated)) return
      if (!bindingAlive(item)) { await removeBinding(item); return }
      if (item.sessions.includes(sessionID)) return item
    } catch {
      // A broken or stale registration must never block the notification itself.
    }
  }))
  return bindings.filter((item): item is WindowBinding => item !== undefined).sort((a, b) => Number(b.active === sessionID) - Number(a.active === sessionID) || b.updated - a.updated)[0]
}

export async function activateWindow(binding: WindowBinding) {
  if (!bindingAlive(binding)) return false
  const pid = await busInteger("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetConnectionUnixProcessID", "s", binding.bus)
  if (!pid) return false
  // The boot-started service has no X11 login environment. Use only the
  // display and authority path of the Konsole process that owns this window.
  const entries = (await readFile(`/proc/${pid}/environ`, "utf8").catch(() => "")).split("\0")
  const display = entries.find((entry) => entry.startsWith("DISPLAY="))?.slice(8)
  const authority = entries.find((entry) => entry.startsWith("XAUTHORITY="))?.slice(11)
  if (!display || !/^:\d+(?:\.\d+)?$/.test(display)) return false
  // Resolve the window at click time. A closed D-Bus window must not activate a reused XID.
  const id = await busInteger(binding.bus, `/konsole/MainWindow_${binding.window.split("/").at(-1)}`, "org.kde.KMainWindow", "winId")
  if (!id || !bindingAlive(binding)) return false
  const env: NodeJS.ProcessEnv = { ...process.env, DISPLAY: display }
  delete env.XAUTHORITY
  if (authority && path.isAbsolute(authority)) env.XAUTHORITY = authority
  const child = Bun.spawn(["xdotool", "windowactivate", "--sync", String(id)], { env, stdout: "ignore", stderr: "ignore", timeout: 3000 })
  return await child.exited === 0
}

async function busInteger(...args: string[]) {
  const child = Bun.spawn(["busctl", "--user", "--json=short", "call", ...args], { stdout: "pipe", stderr: "ignore", timeout: 2000 })
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()])
  if (code !== 0) return
  const value: unknown = JSON.parse(output).data?.[0]
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
}
