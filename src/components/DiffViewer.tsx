import { DiffEditor } from '@monaco-editor/react'
import '../lib/monaco'

function languageForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.tsx') || lower.endsWith('.mts') || lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'javascript'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  return 'plaintext'
}

interface DiffViewerProps {
  path: string
  original: string
  modified: string
}

// Side-by-side review: snapshot (left) vs current file (right).
// Read-only — edits happen in the editor; this is for review only.
export default function DiffViewer({ path, original, modified }: DiffViewerProps) {
  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={languageForPath(path)}
      theme="vs-dark"
      loading={
        <div style={{ display: 'grid', placeContent: 'center', height: '100%', color: '#7d8590', fontFamily: 'monospace' }}>
          Loading diff…
        </div>
      }
      options={{
        readOnly: true,
        fontSize: 14,
        lineHeight: 20,
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderSideBySide: true,
        scrollbar: { verticalScrollbarSize: 9 },
      }}
    />
  )
}
