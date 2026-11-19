# OpenCode Native Notifications

An OpenCode V2 plugin for Linux desktop notifications. Tested with OpenCode 2.2.5 and KDE Plasma/Konsole on X11.

- Sends a desktop notification and plays a KDE Ocean sound when a top-level task finishes successfully or asks a question, even when the terminal is focused.
- Waits for background work to finish before announcing task completion. Child sessions do not produce separate completion alerts.
- Clicking a notification can restore and raise an existing Konsole window. It does not switch OpenCode tabs or open a new terminal. Without a registered window, the notification has no click action.

## Install

Run these commands from your OpenCode V2 config directory (normally `${XDG_CONFIG_HOME:-$HOME/.config}/opencode`):

```sh
mkdir -p local-plugins
git clone git@github.com:artempavlov/opencode-native-notifications.git local-plugins/opencode-native-notifications
```

Add the local path to the `plugins` array in `opencode.json` or `opencode.jsonc`, preserving other entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./local-plugins/opencode-native-notifications"]
}
```

If you get duplicate banners, set `attention.notifications` to `false` in `cli.json` to disable the built-in terminal notifications. This does not disable this plugin.

## Requirements

- The OpenCode server runs as your desktop user and can reach the desktop D-Bus session. `notify-send` must be in its `PATH`.
- Audio requires `paplay`, PulseAudio or PipeWire's PulseAudio compatibility service, and the KDE Ocean sound theme. The OpenCode server does not need an X11 display for audio playback.
- Click-to-focus requires the OpenCode TUI in Konsole on X11, plus `busctl` and `xdotool`. Wayland activation is not implemented.

## License

[MIT](LICENSE)
