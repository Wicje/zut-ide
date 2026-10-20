// The terminal chrome around the Zut IDE: a slim native status bar above the
// app itself, which runs as a WebView so every pane, modal and editor in the
// browser build works exactly as it does on the web.

import { useEffect, useRef, useState } from 'react';
import { Box, DevTools, Text, WebView, makeTheme, useTerminalColors } from '@zenbu-labs/pixel';
import type { Root, WebViewHandle, WebViewState } from '@zenbu-labs/pixel';
import { registerCommand } from './commands.js';

const ZUT_RED = '#ef4444';

export interface ZutAppProps {
  root: Root;
  url: string;
}

export function ZutApp({ root, url }: ZutAppProps) {
  const view = useRef<WebViewHandle>(null);
  const [state, setState] = useState<WebViewState | null>(null);
  const [showDevtools, setShowDevtools] = useState(false);
  const theme = makeTheme(useTerminalColors());
  const rem = root.info.basePx;

  useEffect(() => {
    registerCommand('reload', () => view.current?.reload());
    registerCommand('toggle-devtools', () => setShowDevtools((shown) => !shown));
  }, []);

  const status = state?.loading ? 'loading…' : state?.title || 'ready';

  return (
    <Box
      style={{
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: theme.bg,
      }}
    >
      <Box
        style={{
          height: rem * 2.1,
          alignItems: 'center',
          gap: rem * 0.7,
          padding: { left: rem * 0.8, right: rem * 0.8 },
          background: theme.field,
          border: { bottom: [1, theme.hairline] },
        }}
      >
        <Text
          style={{ fontSize: rem * 0.95, color: ZUT_RED, wrap: false, selectable: false }}
        >
          Zut
        </Text>
        <Text
          style={{ fontSize: rem * 0.8, color: theme.muted, wrap: false, selectable: false }}
        >
          {url}
        </Text>
        <Box style={{ flexGrow: 1, flexBasis: 0 }} />
        <Text
          style={{ fontSize: rem * 0.75, color: theme.disabled, wrap: false, selectable: false }}
        >
          {status}
        </Text>
        <Text
          style={{ fontSize: rem * 0.75, color: theme.disabled, wrap: false, selectable: false }}
        >
          ⌃Q quit · ⌃R reload · ⌃⇧D devtools
        </Text>
      </Box>
      <Box style={{ flexGrow: 1, flexBasis: 0 }}>
        <WebView
          ref={view}
          src={url}
          style={{ flexGrow: 1, flexBasis: 0 }}
          onChange={setState}
        />
        {showDevtools && <DevTools target={view} style={{ width: '35%' }} />}
      </Box>
    </Box>
  );
}
