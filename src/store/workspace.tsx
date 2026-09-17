import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  type ReactNode,
  type Dispatch,
} from 'react'
import type { ConsoleEntry, ConsoleLevel, FileMap, RunStatus } from '../types'

export interface WorkspaceState {
  files: FileMap
  activeFile: string
  projectId: string | null
  projectName: string
  isSharedView: boolean
  readOnly: boolean
  consoleEntries: ConsoleEntry[]
  runStatus: RunStatus
  saved: boolean
  error: string | null
  hydrated: boolean
}

type Action =
  | { type: 'LOAD_PROJECT'; files: FileMap; name: string; projectId: string | null; readOnly?: boolean; isSharedView?: boolean; activeFile?: string }
  | { type: 'SET_FILE'; path: string; content: string }
  | { type: 'ADD_FILE'; path: string; content: string }
  | { type: 'DELETE_FILE'; path: string }
  | { type: 'RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'SET_ACTIVE'; path: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_PROJECT_ID'; id: string | null }
  | { type: 'SET_RUN_STATUS'; status: RunStatus }
  | { type: 'APPEND_CONSOLE'; entry: ConsoleEntry }
  | { type: 'CLEAR_CONSOLE' }
  | { type: 'SET_SAVED'; saved: boolean }
  | { type: 'SET_ERROR'; error: string | null }

let consoleId = 0

function initialState(): WorkspaceState {
  return {
    files: {},
    activeFile: '',
    projectId: null,
    projectName: 'untitled',
    isSharedView: false,
    readOnly: false,
    consoleEntries: [],
    runStatus: 'idle',
    saved: true,
    error: null,
    hydrated: false,
  }
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'LOAD_PROJECT': {
      const keys = Object.keys(action.files).sort()
      let active = action.activeFile || 'index.html'
      if (!(active in action.files)) active = keys[0] || ''
      return {
        ...state,
        files: action.files,
        activeFile: active,
        projectId: action.projectId,
        projectName: action.name,
        readOnly: Boolean(action.readOnly),
        isSharedView: Boolean(action.isSharedView),
        saved: true,
        hydrated: true,
      }
    }
    case 'SET_FILE':
      return { ...state, files: { ...state.files, [action.path]: action.content }, saved: false }
    case 'ADD_FILE': {
      const next = { ...state.files, [action.path]: action.content }
      return { ...state, files: next, activeFile: action.path, saved: false }
    }
    case 'DELETE_FILE': {
      const next = { ...state.files }
      delete next[action.path]
      const keys = Object.keys(next)
      return {
        ...state,
        files: next,
        activeFile: state.activeFile === action.path ? keys[0] || '' : state.activeFile,
        saved: false,
      }
    }
    case 'RENAME_FILE': {
      if (!(action.oldPath in state.files)) return state
      const next: FileMap = {}
      for (const [k, v] of Object.entries(state.files)) {
        next[k === action.oldPath ? action.newPath : k] = v
      }
      return {
        ...state,
        files: next,
        activeFile: state.activeFile === action.oldPath ? action.newPath : state.activeFile,
        saved: false,
      }
    }
    case 'SET_ACTIVE':
      return { ...state, activeFile: action.path }
    case 'SET_NAME':
      return { ...state, projectName: action.name, saved: false }
    case 'SET_PROJECT_ID':
      return { ...state, projectId: action.id }
    case 'SET_RUN_STATUS':
      return { ...state, runStatus: action.status }
    case 'APPEND_CONSOLE':
      return { ...state, consoleEntries: [...state.consoleEntries, action.entry].slice(-500) }
    case 'CLEAR_CONSOLE':
      return { ...state, consoleEntries: [] }
    case 'SET_SAVED':
      return { ...state, saved: action.saved }
    case 'SET_ERROR':
      return { ...state, error: action.error }
    default:
      return state
  }
}

interface WorkspaceApi {
  state: WorkspaceState
  dispatch: Dispatch<Action>
  addConsole: (level: ConsoleLevel, message: string, meta?: { file?: string; line?: number; column?: number }) => void
  clearConsole: () => void
  loadFiles: (files: FileMap, name: string, opts?: { projectId?: string | null; readOnly?: boolean; isSharedView?: boolean; activeFile?: string }) => void
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const addConsole = useCallback((level: ConsoleLevel, message: string, meta?: { file?: string; line?: number; column?: number }) => {
    dispatch({
      type: 'APPEND_CONSOLE',
      entry: { id: ++consoleId, level, message, timestamp: Date.now(), ...meta },
    })
  }, [])

  const clearConsole = useCallback(() => dispatch({ type: 'CLEAR_CONSOLE' }), [])

  const loadFiles = useCallback((files: FileMap, name: string, opts?: { projectId?: string | null; readOnly?: boolean; isSharedView?: boolean; activeFile?: string }) => {
    dispatch({
      type: 'LOAD_PROJECT',
      files,
      name,
      projectId: opts?.projectId ?? null,
      readOnly: opts?.readOnly,
      isSharedView: opts?.isSharedView,
    })
  }, [])

  const api = useMemo<WorkspaceApi>(
    () => ({ state, dispatch, addConsole, clearConsole, loadFiles }),
    [state, addConsole, clearConsole, loadFiles],
  )

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}