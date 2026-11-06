// How the app is being hosted, when that changes how much work it should do.
//
// The terminal client (`zut term`) paints a WebView over the kitty graphics
// protocol: every frame is encoded and written to the terminal. Wallpapers,
// blur and colour transitions make that stream much heavier, and a blinking
// caret repaints the whole editor forever. The launcher adds `?terminal=1`,
// so the app can drop those effects there without changing the browser build.

export function isTerminalClient(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('terminal');
  } catch {
    return false;
  }
}
