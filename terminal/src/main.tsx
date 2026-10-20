// Pixel entry point. Runs inside the pixel runtime, renders the Zut IDE in
// the terminal and owns the global key bindings.

import { createRoot } from '@zenbu-labs/pixel';
import { ZutApp } from './ZutApp.js';
import { runCommand } from './commands.js';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

const root = createRoot({
  name: 'zut',
  onKey(event) {
    if (event.kind !== 'press') return false;
    // Ctrl+Q quits. Ctrl+C is left to the app so copy still works.
    if (event.mods.ctrl && event.key === 'q') {
      root.stop();
      return true;
    }
    if (event.mods.ctrl && event.mods.shift && event.key === 'd') {
      return runCommand('toggle-devtools');
    }
    if (event.mods.ctrl && event.key === 'r') {
      return runCommand('reload');
    }
    return false;
  },
  onUnsupportedTerminal(terminal) {
    return terminal
      ? `zut: ${terminal.name} cannot draw graphics. Use kitty, ghostty, wezterm, foot, or tmux with kitty graphics passthrough.`
      : 'zut: this terminal cannot draw graphics (the kitty graphics protocol is required).';
  },
});

root.setTitle('Zut');

root.render(<ZutApp root={root} url={url} />);
