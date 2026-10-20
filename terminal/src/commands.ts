// Small command registry so the pixel root's global key handler can drive
// the React tree (reload, devtools) without owning the WebView handle.

type Command = () => void;

const registry = new Map<string, Command>();

export function registerCommand(id: string, fn: Command): void {
  registry.set(id, fn);
}

export function runCommand(id: string): boolean {
  const fn = registry.get(id);
  if (!fn) return false;
  fn();
  return true;
}
