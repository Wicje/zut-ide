import Editor from '@monaco-editor/react'
import { useRef } from 'react'
import type { editor } from 'monaco-editor'
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

interface CodeEditorProps {
  path: string
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
}

export default function CodeEditor({ path, value, readOnly, onChange }: CodeEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  return (
    <Editor
      path={path}
      defaultLanguage={languageForPath(path)}
      value={value}
      theme="vs-dark"
      loading={
        <div style={{ display: 'grid', placeContent: 'center', height: '100%', color: '#7d8590', fontFamily: 'monospace' }}>
          Loading editor…
        </div>
      }
      onChange={(v) => onChangeRef.current?.(v ?? '')}
      options={{
        readOnly,
        fontSize: 14,
        lineHeight: 20,
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        formatOnPaste: true,
        renderWhitespace: 'selection',
        smoothScrolling: true,
        padding: { top: 12 },
        scrollbar: { verticalScrollbarSize: 9 },
      }}
      onMount={(editor: editor.IStandaloneCodeEditor, monaco) => {
        monaco.editor.setModelLanguage(editor.getModel()!, languageForPath(path))
      }}
    />
  )
}