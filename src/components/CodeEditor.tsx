import Editor from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
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

interface RevealTarget {
  token: number
  line?: number
  column?: number
}

interface CodeEditorProps {
  path: string
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
  reveal?: RevealTarget | null
}

export default function CodeEditor({ path, value, readOnly, onChange, reveal }: CodeEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    if (!reveal || !editorRef.current) return
    const instance = editorRef.current
    const monaco = monacoRef.current
    const line = reveal.line && reveal.line > 0 ? reveal.line : 1
    const column = reveal.column && reveal.column > 0 ? reveal.column : 1
    const frame = requestAnimationFrame(() => {
      instance.revealLineInCenter(line)
      instance.setPosition({ lineNumber: line, column })
      instance.focus()
      if (monaco) {
        const model = instance.getModel()
        const lineCount = model?.getLineCount() ?? line
        const target = Math.min(line, Math.max(lineCount, 1))
        decorationsRef.current?.clear()
        decorationsRef.current = instance.createDecorationsCollection([
          {
            range: new monaco.Range(target, 1, target, 1),
            options: { isWholeLine: true, className: 'zut-error-line' },
          },
        ])
        window.setTimeout(() => decorationsRef.current?.clear(), 2000)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [reveal])

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
        editorRef.current = editor
        monacoRef.current = monaco
        monaco.editor.setModelLanguage(editor.getModel()!, languageForPath(path))
      }}
    />
  )
}
