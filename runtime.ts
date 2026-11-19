import path from "node:path"

export function desktopRuntimeDirectory() {
  // The shared server may inherit a project's runtime directory. Its desktop
  // bus still identifies the login session used by Konsole and PulseAudio.
  const address = process.env.DBUS_SESSION_BUS_ADDRESS?.match(/(?:^|;)unix:path=([^,;]+)/)?.[1]
  if (address) {
    const socket = decodeURIComponent(address)
    if (path.isAbsolute(socket) && path.basename(socket) === "bus") return path.dirname(socket)
  }
  return process.env.XDG_RUNTIME_DIR ?? process.env.XDG_STATE_HOME ?? path.join(process.env.HOME!, ".local/state")
}
