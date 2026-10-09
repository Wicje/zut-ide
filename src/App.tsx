import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ComposerPane } from './components/ComposerPane';
import { DiffReviewPane } from './components/DiffReviewPane';
import { CodeEditorPane } from './components/CodeEditorPane';
import { LiveAppPreviewPane } from './components/LiveAppPreviewPane';
import { TestExplorerPane } from './components/TestExplorerPane';
import { VideoPreviewModal } from './components/VideoPreviewModal';
import { PRModal } from './components/PRModal';
import { PRReviewStudioModal, type PRCheck, type PRCommit, type PRComment } from './components/PRReviewStudioModal';
import { VercelDeployModal } from './components/VercelDeployModal';
import { HistoryModal } from './components/HistoryModal';
import { ShareModal } from './components/ShareModal';
import { GitHubPushModal } from './components/GitHubPushModal';
import { ImportModal } from './components/ImportModal';
import { LoginAndAccountModal } from './components/LoginAndAccountModal';
import { CursorRulesModal } from './components/CursorRulesModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { NewAgentModal } from './components/NewAgentModal';
import type {
  AgentStep,
  DiffViewMode,
  ThemeMode,
  SessionData,
  SidebarSection,
  RightPaneMode,
  TestCase,
} from './types';
import type { FileMap } from './adapters/filemap';
import {
  detectProjectKind,
  findProgramEntry,
  fileMapToProjectFiles,
  buildDiffFiles,
} from './adapters/filemap';
import { parseEdits, stripEditBlocks } from './adapters/aiEdits';
import { initRunner, bundleProject, buildSrcdoc, formatBuildErrors, CONSOLE_SOURCE } from './adapters/preview';
import {
  brokerEnabled,
  cloudEnabled,
  getSupabase,
  listProjects,
  createProject,
  updateProject,
  setProjectShared,
  buildShareLink,
  runEntry,
  cloudAgentTurn,
  agentUseThisMonth,
  bumpAgentUse,
  AGENT_MONTHLY_CAP,
  loadDraft,
  saveDraft,
  listSnapshots,
  takeSnapshot,
  loadRules,
  saveRules,
  deployStatic,
} from './adapters/zut';
import { geminiTurn, getGeminiKey, setGeminiKey } from './adapters/gemini';
import { getProviderKey, setProviderKey, clearProviderKey, type DirectProvider } from './adapters/providers';
import lightWallpaperImg from './assets/images/macos_mountain_wallpaper_1791421916911.jpg';
import darkWallpaperImg from './assets/images/macos_dark_wallpaper_1791422419326.jpg';
import {
  CheckCircle2,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  RefreshCw,
  Command,
} from 'lucide-react';

const STARTER: FileMap = {
  'index.html':
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>zut app</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <h1>Hello from zut</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n',
  'styles.css': 'body { font-family: system-ui, sans-serif; padding: 2rem; }\n',
  'app.js': 'console.log("Hello from zut!");\n',
};

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];
const CLOUD_LABEL = 'Cloud agent';
const OPENCODE_LABEL = 'opencode (self-host)';
const PROVIDER_LABELS = [
  { id: 'openrouter' as const, label: 'OpenRouter' },
  { id: 'anthropic' as const, label: 'Claude' },
  { id: 'chatgpt' as const, label: 'ChatGPT' },
];

function labelToGeminiId(label: string): string {
  return GEMINI_MODELS.find((m) => m.label === label)?.id ?? GEMINI_MODELS[0].id;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function stamp(): string {
  return new Date().toLocaleTimeString([], { hour12: false });
}

interface RunRecord {
  id: string;
  label: string;
  exitCode: number | null;
  durationMs: number;
  at: number;
  output: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function blankSession(id: string, title: string, model: string): SessionData {
  return {
    id,
    title,
    prompt: '',
    steps: [],
    response: '',
    summary: '',
    diffStats: { additions: 0, deletions: 0, filesCount: 0 },
    files: [],
    model,
  };
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>('diff');
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('unified');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isPRModalOpen, setIsPRModalOpen] = useState(false);
  const [isPRStudioOpen, setIsPRStudioOpen] = useState(false);
  const [isVercelDeployOpen, setIsVercelDeployOpen] = useState(false);
  const [isLoginAccountOpen, setIsLoginAccountOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Resizable Split-Pane Dimensions (Feature 1)
  const [sidebarWidth, setSidebarWidth] = useState(210);
  const [composerWidth, setComposerWidth] = useState(380);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingComposer, setIsResizingComposer] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Real user (Supabase session; signed out by default) ----
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [geminiKeySet, setGeminiKeySet] = useState(() => getGeminiKey() !== null);
  const [providerKeySet, setProviderKeySet] = useState<Record<string, boolean>>(() => ({
    openrouter: getProviderKey('openrouter') !== null,
    anthropic: getProviderKey('anthropic') !== null,
    chatgpt: getProviderKey('chatgpt') !== null,
  }));

  useEffect(() => {
    void import('./adapters/mudauth').then(({ mudSession, readMudCallback, persistMudCallback, clearMudCallbackFromUrl }) => {
      // OAuth / magic-link redirects land back here with a session in the URL.
      const cb = readMudCallback();
      if (cb) {
        persistMudCallback(cb);
        clearMudCallbackFromUrl();
      }
      mudSession()
        .then((u) => {
          if (u?.email) {
            setUser({ name: u.name?.trim() || u.email.split('@')[0], email: u.email });
            if (cb) showToast('Signed in with Mudbase.');
          }
        })
        .catch(() => {});
    });
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u?.email) {
        setUser({
          name: (u.user_metadata?.name as string | undefined) ?? u.email.split('@')[0],
          email: u.email,
        });
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u?.email) {
        setUser({
          name: (u.user_metadata?.name as string | undefined) ?? u.email.split('@')[0],
          email: u.email,
        });
      } else {
        setUser(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- Real project (local draft first, broker cloud when signed in) ----
  const [files, setFiles] = useState<FileMap>(() => loadDraft()?.files ?? STARTER);
  const [projectName, setProjectName] = useState(() => loadDraft()?.name ?? 'my-project');
  const [projectId, setProjectId] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    saveDraft(projectName, files);
  }, [projectName, files]);

  // Baseline snapshot so "modified" dots and diffs have something to compare.
  useEffect(() => {
    if (listSnapshots().length === 0) takeSnapshot(filesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the most recent cloud project on sign-in (local draft stays otherwise).
  useEffect(() => {
    if (!user || !brokerEnabled()) return;
    listProjects()
      .then((rows) => {
        if (rows.length === 0) return;
        const latest = rows[0];
        setProjectId(latest.id);
        setSavedTo('cloud');
        if (latest.share_token) setShareLink(buildShareLink(latest.share_token));
        if (Object.keys(filesRef.current).length <= 3) {
          setFiles({ ...latest.files });
          setProjectName(latest.name);
          takeSnapshot({ ...latest.files });
          showToast(`Opened cloud project "${latest.name}"`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const kind = useMemo(() => detectProjectKind(files), [files]);
  const reviewBase = useMemo(() => {
    const snaps = listSnapshots();
    return snaps.length > 0 ? snaps[0].files : {};
  }, [files]);
  const projectFiles = useMemo(
    () => fileMapToProjectFiles(files, (p) => (reviewBase[p] ?? '') !== (files[p] ?? '')),
    [files, reviewBase],
  );
  const [activeFilePath, setActiveFilePath] = useState<string>(() => {
    const names = Object.keys(loadDraft()?.files ?? STARTER).sort();
    return names[0] ?? 'index.html';
  });

  // ---- Real sessions (agent conversations; no fixtures) ----
  const [sessions, setSessions] = useState<Record<string, SessionData>>(() => {
    const id = 'session-1';
    return { [id]: blankSession(id, 'New agent', 'Gemini 2.5 Flash') };
  });
  const [activeSessionId, setActiveSessionId] = useState<string>('session-1');
  const [sessionBases, setSessionBases] = useState<Record<string, FileMap>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMsg[]>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [isGenerating, setIsGenerating] = useState(false);
  // Ref mirror so a workspace reset can cancel/restart turns synchronously
  // (state reads in stale closures would otherwise block the new turn).
  const generatingRef = useRef(false);

  const activeSession = sessions[activeSessionId] ?? Object.values(sessions)[0];
  const activeFiles = activeSession.files;

  // ---- Runs, preview, events, video, PR (all real) ----
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [srcDoc, setSrcDoc] = useState('');
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [buildMs, setBuildMs] = useState<number | null>(null);
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null);

  // Remote live URL (Cells dev server) when the broker has one.
  useEffect(() => {
    if (!projectId) {
      setRemotePreviewUrl(null);
      return;
    }
    let cancelled = false;
    void import('./adapters/zut').then(({ brokerPreview }) => {
      brokerPreview(projectId)
        .then((p) => {
          if (!cancelled) setRemotePreviewUrl(p.url);
        })
        .catch(() => {
          if (!cancelled) setRemotePreviewUrl(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const [savedTo, setSavedTo] = useState<'device' | 'cloud'>('device');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [events, setEvents] = useState<string[]>(() => [`[${stamp()}] Workspace ready.`]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prData, setPrData] = useState<{
    title: string;
    description: string;
    shareUrl: string | null;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const logEvent = (tag: string, msg: string) => {
    setEvents((prev) => [...prev.slice(-199), `[${stamp()}] [${tag}] ${msg}`]);
  };

  // Preview console harness -> console drawer lines.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { source?: string; type?: string; payload?: { level?: string; message?: string } };
      if (data && data.source === CONSOLE_SOURCE && data.type === 'console') {
        setConsoleLines((prev) => [...prev.slice(-199), `[${data.payload?.level ?? 'log'}] ${data.payload?.message ?? ''}`]);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function rebuildPreview(target: FileMap) {
    if (detectProjectKind(target) !== 'web' || target['index.html'] === undefined) {
      setSrcDoc('');
      return;
    }
    const t0 = performance.now();
    try {
      // Weak devices first: cloud's native esbuild, then local wasm.
      let bundle;
      try {
        const { bundleProjectRemote } = await import('./adapters/preview');
        bundle = await bundleProjectRemote(target);
      } catch (e) {
        if (!(e as Error).message.startsWith('REMOTE_UNREACHABLE:')) throw e;
        await initRunner();
        bundle = await bundleProject(target);
      }
      setSrcDoc(buildSrcdoc(target['index.html'], bundle));
      setBuildMs(Math.round(performance.now() - t0));
    } catch (e) {
      const errs = formatBuildErrors(e).map((r) => r.message).join(' | ');
      setConsoleLines((prev) => [...prev.slice(-199), `[error] Build error: ${errs}`]);
      setSrcDoc('');
      setBuildMs(null);
    }
  }

  // Live preview rebuilds as web files change (debounced).
  useEffect(() => {
    if (kind !== 'web') {
      setSrcDoc('');
      return;
    }
    const t = setTimeout(() => {
      void rebuildPreview(filesRef.current);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, kind]);

  function recordRun(label: string, exitCode: number | null, durationMs: number, output: string) {
    const rec: RunRecord = { id: `run-${Date.now()}`, label, exitCode, durationMs, at: Date.now(), output };
    setRuns((prev) => [rec, ...prev].slice(0, 20));
    logEvent('RUN', `${label} → exit ${exitCode ?? '?'} in ${durationMs}ms`);
    return rec;
  }

  async function executeEntry(entry: string | null, stdin = ''): Promise<string[]> {
    const current = filesRef.current;
    if (!entry) return ['No runnable entry found (expected main.py or main.go).'];
    try {
      const result = await runEntry(current, entry, stdin);
      const lines: string[] = [];
      if (result.stdout.trim()) lines.push(...result.stdout.slice(0, 4000).split('\n').slice(0, 20));
      if (result.stderr.trim()) lines.push(...result.stderr.slice(0, 2000).split('\n').slice(0, 10).map((l) => `stderr: ${l}`));
      lines.push(`exit ${result.exitCode ?? '?'} in ${result.durationMs}ms`);
      if (result.truncated) lines.push('(output truncated at 256KB)');
      recordRun(`run ${entry}`, result.exitCode, result.durationMs, result.stdout.slice(0, 2000));
      return lines;
    } catch (e) {
      return [`error: ${(e as Error).message}`];
    }
  }

  // ---- Real agent turn (Gemini direct, or cloud agent) ----
  async function runAgentTurn(sessionId: string, promptText: string) {
    const sess = sessionsRef.current[sessionId];
    if (!sess || generatingRef.current) return;
    const base = { ...filesRef.current };
    const snap = takeSnapshot(base);
    const t0 = performance.now();
    setSessionBases((prev) => ({ ...prev, [sessionId]: base }));
    generatingRef.current = true;
    setIsGenerating(true);
    const runningStepId = `step-${Date.now()}`;
    const pushStep = (step: AgentStep) => {
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        return { ...prev, [sessionId]: { ...s, steps: [...s.steps, step] } };
      });
    };
    pushStep({ id: runningStepId, type: 'edit', query: promptText.slice(0, 64), status: 'running', checkpointId: snap.id });
    const dropRunning = () => {
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        return { ...prev, [sessionId]: { ...s, steps: s.steps.filter((x) => x.id !== runningStepId) } };
      });
    };

    try {
      const modelLabel = sessionsRef.current[sessionId]?.model ?? 'Gemini 2.5 Flash';
      let reply: string;
      let changedPaths: string[];
      if (modelLabel === CLOUD_LABEL) {
        const r = await cloudAgentTurn(base, promptText, { projectId });
        for (const [p, c] of Object.entries(r.updated)) base[p] = c;
        for (const [p, c] of Object.entries(r.created)) base[p] = c;
        for (const p of r.deleted) delete base[p];
        reply = r.reply;
        changedPaths = [...Object.keys(r.updated), ...Object.keys(r.created), ...r.deleted];
      } else if (modelLabel === OPENCODE_LABEL) {
        const { opencodeTurn } = await import('./adapters/opencode');
        const { buildSystemPrompt } = await import('./adapters/gemini');
        const r = await opencodeTurn(
          base,
          promptText,
          buildSystemPrompt(projectName, base, activeFilePath),
          () => {},
        );
        for (const [p, c] of Object.entries(r.updated)) base[p] = c;
        for (const [p, c] of Object.entries(r.created)) base[p] = c;
        for (const p of r.deleted) delete base[p];
        reply = r.reply;
        changedPaths = [...Object.keys(r.updated), ...Object.keys(r.created), ...r.deleted];
      } else if (PROVIDER_LABELS.some((p) => p.label === modelLabel)) {
        const provider = PROVIDER_LABELS.find((p) => p.label === modelLabel)!.id;
        const { streamProvider } = await import('./adapters/providers');
        const { buildSystemPrompt } = await import('./adapters/gemini');
        const history = (chatHistories[sessionId] ?? []).slice(-12);
        let acc = '';
        await streamProvider(
          provider,
          history,
          buildSystemPrompt(projectName, base, activeFilePath),
          (d) => {
            acc += d;
          },
        );
        reply = acc;
        changedPaths = [];
        const edits = parseEdits(reply, base);
        for (const e of edits) {
          base[e.path] = e.content;
          changedPaths.push(e.path);
        }
        setChatHistories((prev) => ({
          ...prev,
          [sessionId]: [
            ...(prev[sessionId] ?? []),
            { role: 'user' as const, content: promptText },
            { role: 'assistant' as const, content: reply },
          ].slice(-24),
        }));
      } else {
        const history = (chatHistories[sessionId] ?? []).slice(-12);
        const r = await geminiTurn(history, promptText, {
          model: labelToGeminiId(modelLabel),
          projectName,
          files: base,
          activePath: activeFilePath,
        });
        reply = r.reply;
        changedPaths = [];
        const edits = parseEdits(reply, base);
        for (const e of edits) {
          base[e.path] = e.content;
          changedPaths.push(e.path);
        }
        setChatHistories((prev) => ({
          ...prev,
          [sessionId]: [
            ...(prev[sessionId] ?? []),
            { role: 'user' as const, content: promptText },
            { role: 'assistant' as const, content: reply },
          ].slice(-24),
        }));
      }

      // The workspace may have been reset (New Agent) while this turn ran —
      // never let a stale turn overwrite the fresh instance.
      if (!sessionsRef.current[sessionId]) {
        dropRunning();
        return;
      }
      const ms = Math.round(performance.now() - t0);
      setFiles({ ...base });
      const files = buildDiffFiles(snap.files, base);
      const totals = files.reduce(
        (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
        { additions: 0, deletions: 0 },
      );
      const clean = stripEditBlocks(reply);
      const done: AgentStep[] =
        changedPaths.length > 0
          ? changedPaths.map((p, i) => ({
              id: `step-${Date.now()}-${i}`,
              type: 'edit' as const,
              query: p,
              status: 'completed' as const,
              durationMs: ms,
              details: 'Applied to workspace',
              checkpointId: snap.id,
              matches: [],
            }))
          : [
              {
                id: `step-${Date.now()}`,
                type: 'read' as const,
                query: `Reviewed ${Object.keys(base).length} project files`,
                status: 'completed' as const,
                durationMs: ms,
                checkpointId: snap.id,
              },
            ];
      dropRunning();
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        return {
          ...prev,
          [sessionId]: {
            ...s,
            prompt: s.prompt || promptText,
            response: clean.slice(0, 2000),
            summary: clean.slice(0, 280),
            diffStats: { additions: totals.additions, deletions: totals.deletions, filesCount: files.length },
            files,
          },
        };
      });
      bumpAgentUse();
      logEvent('AGENT', `Turn done in ${ms}ms (${files.length} files)`);
      showToast(files.length > 0 ? `Agent updated ${files.length} file${files.length === 1 ? '' : 's'} — review the diff` : 'Agent replied (no file changes)');
    } catch (e) {
      dropRunning();
      pushStep({
        id: `step-${Date.now()}`,
        type: 'edit',
        query: promptText.slice(0, 64),
        status: 'failed',
        details: (e as Error).message,
      });
      showToast(`Agent failed: ${(e as Error).message}`);
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  // Sidebar sections from live data (agents + project files).
  const sections: SidebarSection[] = [
    {
      title: 'Agents',
      items: Object.values(sessions).map((s) => ({ id: s.id, title: s.title })),
    },
    {
      title: 'Project',
      items: Object.keys(files)
        .sort()
        .map((p) => ({ id: `file:${p}`, title: p })),
    },
  ];

  const telemetry = useMemo(() => {
    if (runs.length === 0) return null;
    const ds = runs.map((r) => r.durationMs).sort((a, b) => a - b);
    return {
      runs: runs.length,
      medianMs: ds[Math.floor(ds.length / 2)],
      lastExit: runs[0].exitCode,
      lastAt: new Date(runs[0].at).toLocaleTimeString([], { hour12: false }),
    };
  }, [runs]);

  const testRows: TestCase[] = useMemo(
    () =>
      runs.slice(0, 10).map((r) => ({
        id: r.id,
        name: `${r.label} (exit ${r.exitCode ?? '?'})`,
        file: r.label.startsWith('run ') ? r.label.slice(4) : projectName,
        status: r.exitCode === 0 ? ('passed' as const) : ('failed' as const),
        durationMs: r.durationMs,
        ...(r.exitCode !== 0 ? { error: r.output.slice(0, 500) || `Exited with code ${r.exitCode}` } : {}),
      })),
    [runs, projectName],
  );

  async function handleTerminalCommand(cmd: string): Promise<string[]> {
    const [verb, ...rest] = cmd.trim().split(/\s+/);
    if (verb === 'run') {
      const k = detectProjectKind(filesRef.current);
      if (k === 'web') {
        await rebuildPreview(filesRef.current);
        return srcDoc || filesRef.current['index.html'] !== undefined
          ? ['Preview rebuilt — open the Preview pane.']
          : ['No index.html — nothing to preview.'];
      }
      const entry = rest[0] ?? findProgramEntry(filesRef.current, k);
      return executeEntry(entry);
    }
    if (verb === 'status') {
      return [
        `Project ${projectName} (${kind}, ${Object.keys(filesRef.current).length} files)`,
        `${runs.length} runs recorded this session`,
        brokerEnabled() ? 'Broker: connected' : 'Broker: not configured (VITE_BROKER_URL)',
      ];
    }
    if (verb === 'help') return ['Commands: run [entry], status, help'];
    return [`unknown command: ${verb}. Try run, status, help.`];
  }

  async function handleMagicLink(email: string): Promise<string> {
    const sb = getSupabase();
    if (!sb) throw new Error('Sign-in is not configured (VITE_SUPABASE_URL).');
    setSignInError(null);
    const { error } = await sb.auth.signInWithOtp({ email });
    if (error) {
      setSignInError(error.message);
      throw new Error(error.message);
    }
    return 'Check your email for the sign-in link — it lands you straight back here.';
  }

  // Close the login modal the moment a real session lands (e.g. OAuth redirect).
  useEffect(() => {
    if (user) setIsLoginAccountOpen(false);
  }, [user]);

  // Esc dismisses any open modal (backdrop click already does; keyboard parity).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsCommandPaletteOpen(false);
      setIsNewAgentOpen(false);
      setIsVideoModalOpen(false);
      setIsPRModalOpen(false);
      setIsPRStudioOpen(false);
      setIsVercelDeployOpen(false);
      setIsLoginAccountOpen(false);
      setIsRulesModalOpen(false);
      setShowHistory(false);
      setShowShare(false);
      setShowGithub(false);
      setShowImport(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function captureScreen(): Promise<string | null> {
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (c?: unknown) => Promise<MediaStream> };
    if (!md?.getDisplayMedia) throw new Error('Screen capture is not supported in this browser.');
    const stream = await md.getDisplayMedia({ video: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const done = new Promise<string | null>((resolve) => {
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length === 0) resolve(null);
        else resolve(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'video/webm' })));
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        try {
          rec.stop();
        } catch {
          resolve(null);
        }
      });
    });
    rec.start();
    showToast('Recording… stop sharing to finish the clip.');
    return done;
  }

  // Mouse drag handlers for resizable dividers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      if (isResizingSidebar) {
        const newWidth = Math.min(Math.max(relativeX, 160), 320);
        setSidebarWidth(newWidth);
      } else if (isResizingComposer) {
        const newComposerWidth = Math.min(Math.max(relativeX - sidebarWidth, 260), 540);
        setComposerWidth(newComposerWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar || isResizingComposer) {
        setIsResizingSidebar(false);
        setIsResizingComposer(false);
      }
    };

    if (isResizingSidebar || isResizingComposer) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingComposer, sidebarWidth]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewAgentOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDiffViewMode((prev) => (prev === 'unified' ? 'split' : 'unified'));
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setRightPaneMode('diff');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setRightPaneMode('editor');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setRightPaneMode('preview');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault();
        setRightPaneMode('tests');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    showToast(`Switched to ${next} mode`);
  };

  const handleAcceptFile = (fileId: string) => {
    // Edits land in the workspace immediately; accept marks review state.
    showToast('File hunk accepted');
    void fileId;
  };

  const handleRevertFile = (fileId: string) => {
    const base = sessionBases[activeSessionId] ?? {};
    const target = activeSession.files.find((f) => f.id === fileId);
    if (!target) return;
    takeSnapshot(filesRef.current);
    setFiles((prev) => {
      const next = { ...prev };
      if (target.path in base) next[target.path] = base[target.path];
      else delete next[target.path];
      return next;
    });
    setSessions((prev) => {
      const s = prev[activeSessionId];
      if (!s) return prev;
      const kept = s.files.filter((f) => f.id !== fileId);
      const totals = kept.reduce(
        (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
        { additions: 0, deletions: 0 },
      );
      return {
        ...prev,
        [activeSessionId]: {
          ...s,
          files: kept,
          diffStats: { ...s.diffStats, additions: totals.additions, deletions: totals.deletions, filesCount: kept.length },
        },
      };
    });
    showToast('File hunk changes reverted');
  };

  const handleToggleStageFile = (fileId: string) => {
    setSessions((prev) => {
      const sess = prev[activeSessionId];
      if (!sess) return prev;
      const updatedFiles = sess.files.map((f) =>
        f.id === fileId ? { ...f, staged: !f.staged } : f
      );
      return { ...prev, [activeSessionId]: { ...sess, files: updatedFiles } };
    });
  };

  const handleRollbackCheckpoint = (checkpointId: string, stepTitle: string) => {
    const snap = listSnapshots().find((s) => s.id === checkpointId);
    if (!snap) {
      showToast('Snapshot not found.');
      return;
    }
    takeSnapshot(filesRef.current);
    setFiles({ ...snap.files });
    logEvent('ROLLBACK', stepTitle);
    showToast(`Rolled back workspace to snapshot: ${checkpointId}`);
  };

  const handleAskComposerAboutLine = (snippet: string) => {
    setRightPaneMode('diff');
    void runAgentTurn(activeSessionId, `Refactor this code: "${snippet.slice(0, 40)}"`);
  };

  const handleAutoFixTest = (test: TestCase) => {
    showToast(`Agent auto-fixing test: "${test.name}"...`);
    void runAgentTurn(activeSessionId, `Test "${test.name}" in ${test.file} failed${test.error ? `: ${test.error}` : ''}. Fix it.`);
  };

  const handleReset = () => {
    if (user && brokerEnabled()) {
      listProjects()
        .then((rows) => {
          if (rows.length > 0) {
            setFiles({ ...rows[0].files });
            setProjectName(rows[0].name);
            setProjectId(rows[0].id);
            showToast('Workspace refreshed from cloud.');
          } else {
            showToast('Nothing to refresh yet.');
          }
        })
        .catch((e: unknown) => showToast(`Refresh failed: ${(e as Error).message}`));
    } else {
      const draft = loadDraft();
      if (draft) {
        setFiles({ ...draft.files });
        setProjectName(draft.name);
      }
      showToast('Workspace refreshed from this device.');
    }
  };

  const [opencodeReady, setOpencodeReady] = useState(false);
  useEffect(() => {
    void import('./adapters/opencode').then(({ selfHostReady }) => {
      selfHostReady()
        .then(setOpencodeReady)
        .catch(() => {});
    });
  }, []);

  const modelOptions = [
    'Gemini 2.5 Flash',
    'Gemini 2.5 Pro',
    ...PROVIDER_LABELS.filter((p) => {
      try {
        return getProviderKey(p.id) !== null;
      } catch {
        return false;
      }
    }).map((p) => p.label),
    ...(cloudEnabled() ? [CLOUD_LABEL] : []),
    ...(opencodeReady ? [OPENCODE_LABEL] : []),
  ];

  function restoreSnapshot(id: string) {
    const snap = listSnapshots().find((s) => s.id === id);
    if (!snap) {
      showToast('Snapshot not found.');
      return;
    }
    takeSnapshot(filesRef.current);
    setFiles({ ...snap.files });
    logEvent('RESTORE', id);
    setShowHistory(false);
    showToast('Snapshot restored (previous state checkpointed).');
  }

  async function handleImport(url: string): Promise<{ name: string; files: number }> {
    const { importFromUrl } = await import('./adapters/importer');
    const result = await importFromUrl(url);
    takeSnapshot(filesRef.current);
    setFiles((prev) => ({ ...prev, ...result.files }));
    setProjectName(result.name);
    logEvent('IMPORT', `${url} → ${Object.keys(result.files).length} files`);
    showToast(`Imported ${Object.keys(result.files).length} files from URL.`);
    return { name: result.name, files: Object.keys(result.files).length };
  }

  function handleUploadFiles(list: FileList | File[]) {
    const incoming = Array.from(list).slice(0, 20);
    if (incoming.length === 0) return;
    void (async () => {
      const next: FileMap = {};
      for (const file of incoming) {
        const isImage = file.type.startsWith('image/');
        const isText =
          file.type.startsWith('text/') ||
          file.type === 'application/json' ||
          /\.(json|js|ts|tsx|jsx|css|html|htm|md|txt|svg)$/i.test(file.name);
        try {
          if (isImage) {
            next[file.name] = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
          } else if (isText || file.size < 512_000) {
            next[file.name] = await file.text();
          }
        } catch {
          /* skip unreadable files */
        }
      }
      const count = Object.keys(next).length;
      if (count === 0) {
        showToast('No readable files in that selection.');
        return;
      }
      setFiles((prev) => ({ ...prev, ...next }));
      logEvent('UPLOAD', `${count} files`);
      showToast(`Added ${count} file${count === 1 ? '' : 's'}.`);
    })();
  }

  const isDark = theme === 'dark';
  const currentWallpaper = isDark ? darkWallpaperImg : lightWallpaperImg;

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex items-center justify-center bg-cover bg-center select-none transition-colors duration-500 ${
        isDark ? 'dark' : ''
      }`}
      style={{
        backgroundImage: `url(${currentWallpaper})`,
        backgroundColor: isDark ? '#141416' : '#6c798a',
      }}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 right-4 z-40 flex items-center gap-2 bg-black/45 dark:bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-white/90 text-xs shadow-xl border border-white/10 transition-opacity hover:opacity-100 opacity-80">
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title="Command Palette (⌘K)"
        >
          <Command size={11} />
          <span className="text-[11px] font-medium hidden sm:inline">⌘K</span>
        </button>

        <span className="text-white/20 text-xs">|</span>

        <button
          onClick={() => setIsVercelDeployOpen(true)}
          className="flex items-center gap-1.5 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title="Deploy to the web"
        >
          <svg viewBox="0 0 76 65" fill="currentColor" className="w-2.5 h-2.5">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          <span className="text-[11px] font-medium hidden md:inline">Deploy</span>
        </button>

        <span className="text-white/20 text-xs">|</span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setRightPaneMode('diff')}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              rightPaneMode === 'diff' ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Diff
          </button>
          <button
            onClick={() => setRightPaneMode('editor')}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              rightPaneMode === 'editor' ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setRightPaneMode('preview')}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              rightPaneMode === 'preview' ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setRightPaneMode('tests')}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              rightPaneMode === 'tests' ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Checks
          </button>
        </div>

        <span className="text-white/20 text-xs">|</span>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
        >
          {isDark ? <Sun size={12} className="text-amber-400" /> : <Moon size={12} className="text-purple-300" />}
        </button>

        <span className="text-white/20 text-xs">|</span>

        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title={isMaximized ? 'Restore Window' : 'Full Screen'}
        >
          {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>

        <span className="text-white/20 text-xs">|</span>

        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title="Refresh workspace from saved state"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Main Cursor App Window with Interactive Drag Handles */}
      <div
        ref={containerRef}
        className={`relative z-10 transition-all duration-100 ease-out flex shadow-2xl overflow-hidden border ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-[96vw] max-w-[1240px] h-[92vh] max-h-[820px] rounded-2xl shadow-2xl shadow-black/50 border-black/15'
        }`}
        style={{
          boxShadow: isMaximized
            ? 'none'
            : isDark
            ? '0 30px 70px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            : '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.12)',
        }}
      >
        {/* Left Column: Sidebar with Dynamic Width */}
        <div style={{ width: `${sidebarWidth}px` }} className="shrink-0 h-full overflow-hidden flex flex-col">
          <Sidebar
            sections={sections}
            activeItem={activeSessionId}
            onSelectItem={(id) => {
              if (id.startsWith('file:')) {
                setActiveFilePath(id.slice(5));
                setRightPaneMode('editor');
              } else if (sessions[id]) {
                setActiveSessionId(id);
                showToast(`Switched session to ${sessions[id].title}`);
              }
            }}
            onNewAgent={() => setIsNewAgentOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenAccount={() => setIsLoginAccountOpen(true)}
            theme={theme}
          />
        </div>

        {/* Feature 1: Draggable Resizer 1 (Between Sidebar & Composer) */}
        <div
          onMouseDown={() => setIsResizingSidebar(true)}
          onDoubleClick={() => setSidebarWidth(210)}
          className={`w-1 shrink-0 h-full cursor-col-resize transition-colors relative z-20 hover:bg-blue-500/50 ${
            isResizingSidebar ? 'bg-blue-600' : isDark ? 'bg-neutral-800' : 'bg-neutral-200'
          }`}
          title="Drag to resize sidebar (Double-click to reset)"
        />

        {/* Middle Column: Composer Ghost Chat Pane with Dynamic Width */}
        <div style={{ width: `${composerWidth}px` }} className="shrink-0 h-full overflow-hidden flex flex-col">
          <ComposerPane
            session={activeSession}
            models={modelOptions}
            onModelChange={(model) => {
              setSessions((prev) => {
                const s = prev[activeSessionId];
                if (!s) return prev;
                return { ...prev, [activeSessionId]: { ...s, model } };
              });
            }}
            attachableFiles={Object.keys(filesRef.current)
              .sort()
              .map((name) => ({ name, tokens: Math.max(1, Math.ceil((filesRef.current[name] ?? '').length / 4)) }))}
            onOpenVideoModal={() => setIsVideoModalOpen(true)}
            onCommitPush={() => {
              void save();
              setIsVercelDeployOpen(true);
            }}
            onReviewClick={() => {
              setRightPaneMode('diff');
              showToast('Focusing SCM diff review pane');
            }}
            onGenerateEdits={(prompt) => {
              void runAgentTurn(activeSessionId, prompt);
            }}
            onRollbackCheckpoint={handleRollbackCheckpoint}
            onOpenRules={() => setIsRulesModalOpen(true)}
            isGenerating={isGenerating}
            theme={theme}
          />
        </div>

        {/* Feature 1: Draggable Resizer 2 (Between Composer & Right Pane) */}
        <div
          onMouseDown={() => setIsResizingComposer(true)}
          onDoubleClick={() => setComposerWidth(380)}
          className={`w-1 shrink-0 h-full cursor-col-resize transition-colors relative z-20 hover:bg-blue-500/50 ${
            isResizingComposer ? 'bg-blue-600' : isDark ? 'bg-neutral-800' : 'bg-neutral-200'
          }`}
          title="Drag to resize composer pane (Double-click to reset)"
        />

        {/* Right Column: Dynamic Pane Selection (flex-1) */}
        <div className="flex-1 h-full overflow-hidden flex flex-col">
          {rightPaneMode === 'diff' && (
            <DiffReviewPane
              files={activeFiles}
              onAcceptFile={handleAcceptFile}
              onRevertFile={handleRevertFile}
              onToggleStageFile={handleToggleStageFile}
              onCreatePR={() => setIsPRModalOpen(true)}
              onCommitPush={() => {
                void save();
                setIsVercelDeployOpen(true);
              }}
              onOpenDeploy={() => setIsVercelDeployOpen(true)}
              onAskComposer={handleAskComposerAboutLine}
              onSwitchToEditor={() => setRightPaneMode('editor')}
              rightPaneMode={rightPaneMode}
              onSelectPaneMode={(mode) => setRightPaneMode(mode)}
              diffViewMode={diffViewMode}
              onToggleDiffViewMode={() => setDiffViewMode(diffViewMode === 'unified' ? 'split' : 'unified')}
              isTerminalOpen={isTerminalOpen}
              onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
              isMaximized={isMaximized}
              onToggleMaximize={() => setIsMaximized(!isMaximized)}
              branchName={projectName}
              theme={theme}
              terminal={{
                onCommand: handleTerminalCommand,
                initialLogs: ['Connected. Type `run [entry]`, `status`, or `help`.'],
                telemetry,
                onRefreshTelemetry: () => {},
                eventLogs: events,
              }}
            />
          )}

          {rightPaneMode === 'editor' && (
            <CodeEditorPane
              files={projectFiles}
              activeFileId={activeFilePath}
              onSelectFile={(id) => setActiveFilePath(id)}
              onEditFile={(fileId, content) => {
                setFiles((prev) => ({ ...prev, [fileId]: content }));
              }}
              onInlinePrompt={(prompt, fileId) => {
                void runAgentTurn(activeSessionId, `In ${fileId}: ${prompt}`);
              }}
              onUploadFiles={handleUploadFiles}
              saveState={savedTo === 'cloud' ? 'Saved · cloud' : 'Saved · this device'}
              buildMs={buildMs}
              onSwitchToDiff={() => setRightPaneMode('diff')}
              theme={theme}
            />
          )}

          {rightPaneMode === 'preview' && (
            <LiveAppPreviewPane
              srcDoc={srcDoc || null}
              previewUrl={remotePreviewUrl}
              previewLabel={kind === 'web' ? 'preview (sandboxed)' : undefined}
              onReloadPreview={() => {
                void rebuildPreview(filesRef.current);
              }}
              onOpenLiveUrl={(url) => window.open(url, '_blank', 'noopener')}
              consoleLines={consoleLines}
              onInspectElement={({ component, file, line }) => {
                setRightPaneMode('diff');
                showToast(`Inspecting ${component} (${file}:${line}) in Composer.`);
                void runAgentTurn(activeSessionId, `Inspect ${component} in ${file}:${line} and explain it.`);
              }}
              onSwitchToDiff={() => setRightPaneMode('diff')}
              theme={theme}
            />
          )}

          {rightPaneMode === 'tests' && (
            <TestExplorerPane
              tests={testRows}
              onRunAll={() => {
                const k = detectProjectKind(filesRef.current);
                if (k === 'web') {
                  void rebuildPreview(filesRef.current).then(() => {
                    recordRun('preview rebuild', 0, 0, 'Preview rebuilt.');
                  });
                } else {
                  const entry = findProgramEntry(filesRef.current, k);
                  void executeEntry(entry).then(() => setRightPaneMode('tests'));
                }
              }}
              onAutoFixTest={handleAutoFixTest}
              theme={theme}
            />
          )}
        </div>
      </div>

      {/* Interactive Modals */}
      <VideoPreviewModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        title={`${activeSession.title} — screen recording`}
        videoSrc={videoUrl}
        onStartCapture={async () => {
          const url = await captureScreen();
          if (url) {
            setVideoUrl(url);
            setSessions((prev) => {
              const s = prev[activeSessionId];
              if (!s) return prev;
              return { ...prev, [activeSessionId]: { ...s, videoPreview: true } };
            });
          }
          return url;
        }}
      />

      <PRModal
        isOpen={isPRModalOpen}
        onClose={() => setIsPRModalOpen(false)}
          onSubmit={(title, description) => {
            void (async () => {
              let shareUrl: string | null = null;
              if (user && brokerEnabled() && projectId) {
                try {
                  shareUrl = await createShareLink();
                } catch (e) {
                  showToast(`Share failed: ${(e as Error).message}`);
                }
              }
            setPrData({ title: title || `${projectName} review`, description, shareUrl });
            setIsPRModalOpen(false);
            setIsPRStudioOpen(true);
            showToast(shareUrl ? `Review link ready: ${shareUrl}` : 'Review opened (sign in + cloud project for a share link).');
          })();
        }}
        baseBranch="main"
        headBranch={projectName}
        diffStat={
          activeFiles.length > 0
            ? `${activeFiles.length} files changed (+${activeFiles.reduce((a, f) => a + f.additions, 0)}, -${activeFiles.reduce((a, f) => a + f.deletions, 0)})`
            : 'No changes'
        }
        initialTitle={`${projectName} review`}
        initialDescription=""
      />

      <PRReviewStudioModal
        isOpen={isPRStudioOpen}
        onClose={() => setIsPRStudioOpen(false)}
        files={activeFiles}
        title={prData?.title ?? `${projectName} review`}
        author={user?.name ?? 'you'}
        baseBranch="main"
        headBranch={projectName}
        commits={listSnapshots()
          .slice(0, 10)
          .map((s) => ({
            hash: s.id.slice(-6),
            message: `Snapshot ${new Date(s.createdAt).toLocaleString()}`,
            time: timeAgo(s.createdAt),
          }))}
        checks={runs.slice(0, 10).map((r) => ({
          name: r.label,
          status: r.exitCode === 0 ? ('passed' as const) : ('failed' as const),
          time: `${r.durationMs}ms`,
        }))}
        comments={[
          ...(prData?.description.trim()
            ? [{ author: user?.name ?? 'you', time: 'just now', body: prData.description.trim() }]
            : []),
          ...(prData?.shareUrl ? [{ author: 'zut', time: 'just now', body: `Review link: ${prData.shareUrl}` }] : []),
        ]}
        onMerge={async () => {
          takeSnapshot(filesRef.current);
          logEvent('MERGE', `${activeFiles.length} files merged`);
          showToast('Changes merged into the workspace.');
        }}
        onMergeSuccess={() => {
          showToast('Pull Request merged into main branch!');
        }}
        theme={theme}
      />

      <VercelDeployModal
        isOpen={isVercelDeployOpen}
        onClose={() => setIsVercelDeployOpen(false)}
        branchName={projectName}
        onDeploy={async (onLog) => {
          onLog('Zipping project…');
          const { url } = await deployStatic(filesRef.current);
          onLog(`Live at ${url}`);
          logEvent('DEPLOY', url);
          return { url };
        }}
        onPushGithub={() => setShowGithub(true)}
        theme={theme}
      />

      <LoginAndAccountModal
        isOpen={isLoginAccountOpen}
        onClose={() => {
          setIsLoginAccountOpen(false);
          setSignInError(null);
        }}
        currentUser={{
          name: user?.name ?? 'Guest',
          email: user?.email ?? 'Not signed in',
          plan: cloudEnabled() ? 'Cloud' : 'Local',
          avatar: '',
          fastRequestsUsed: agentUseThisMonth(),
          fastRequestsLimit: AGENT_MONTHLY_CAP,
        }}
        onLoginSuccess={(u) => {
          setUser(u);
          showToast(`Signed in as ${u.name}`);
        }}
        onLogout={() => {
          void getSupabase()?.auth.signOut();
          void import('./adapters/mudauth').then(({ mudLogout }) => mudLogout());
          setUser(null);
          showToast('Signed out.');
        }}
        onProviderSignIn={async (provider, email) => {
          const sb = getSupabase();
          if (!sb) throw new Error('Sign-in is not configured (VITE_SUPABASE_URL).');
          setSignInError(null);
          if (provider !== 'github' && provider !== 'google') {
            throw new Error('Use a magic link for email sign-in.');
          }
          const { error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo: window.location.origin },
          });
          if (error) throw new Error(error.message);
          return { name: provider, email: email ?? '' };
        }}
        onMagicLink={handleMagicLink}
        signInError={signInError}
        authHint={
          getSupabase()
            ? null
            : 'Running local-only: add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY and restart to enable sign-in.'
        }
        teamLine="Personal workspace"
        quotaLine={`${runs.filter((r) => Date.now() - r.at < 86_400_000).length} runs in the last 24h (broker cap enforced server-side)`}
        resetLine={`Resets ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
        geminiKeySet={geminiKeySet}
        onSaveGeminiKey={(key) => {
          setGeminiKey(key);
          setGeminiKeySet(true);
          showToast('Gemini key saved in this browser.');
        }}
        onClearGeminiKey={() => {
          try {
            localStorage.removeItem('gpide:gemini:key');
          } catch {
            /* ignore */
          }
          setGeminiKeySet(false);
          showToast('Gemini key removed.');
        }}
        providerKeys={providerKeySet}
        onSaveProviderKey={(p: DirectProvider, key: string) => {
          setProviderKey(p, key);
          setProviderKeySet((prev) => ({ ...prev, [p]: true }));
          showToast('Provider key saved in this browser.');
        }}
        onClearProviderKey={(p: DirectProvider) => {
          clearProviderKey(p);
          setProviderKeySet((prev) => ({ ...prev, [p]: false }));
          showToast('Provider key removed.');
        }}
        theme={theme}
      />

      <CursorRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        onSaveRules={(rules) => {
          saveRules(rules);
          showToast('Project rules saved — the agent follows them on every turn.');
        }}
        initialRules={loadRules()}
        theme={theme}
      />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectSession={(id) => {
          if (sessions[id]) setActiveSessionId(id);
        }}
        sessions={Object.values(sessions).map((s) => ({ id: s.id, title: s.title }))}
        onToggleTheme={toggleTheme}
        onToggleDiffMode={() => setDiffViewMode(diffViewMode === 'unified' ? 'split' : 'unified')}
        onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        onCreatePR={() => setIsPRModalOpen(true)}
        onCommitPush={() => {
          void save();
          setIsVercelDeployOpen(true);
        }}
        onNewAgent={() => setIsNewAgentOpen(true)}
        onOpenDeploy={() => setIsVercelDeployOpen(true)}
        onOpenAccount={() => setIsLoginAccountOpen(true)}
        onOpenHistory={() => setShowHistory(true)}
        onShare={() => setShowShare(true)}
        onImportUrl={() => setShowImport(true)}
        onPushGithub={() => setShowGithub(true)}
        theme={theme}
      />

      <NewAgentModal
        isOpen={isNewAgentOpen}
        onClose={() => setIsNewAgentOpen(false)}
        onSubmit={(prompt, model) => {
          // Safety first: snapshot outgoing work so History can restore it.
          takeSnapshot(filesRef.current);
          // Fresh instance, clear of anything: starter files + clean slate.
          const fresh = { ...STARTER };
          const newId = `session-${Date.now()}`;
          const newSession = blankSession(newId, prompt.slice(0, 32) || 'New agent', model);
          newSession.prompt = prompt;
          generatingRef.current = false;
          setIsGenerating(false);
          setFiles(fresh);
          setProjectName('my-project');
          setProjectId(null);
          setShareLink(null);
          setSavedTo('device');
          setActiveFilePath(Object.keys(fresh).sort()[0] ?? 'index.html');
          setSessions({ [newId]: newSession });
          setSessionBases({});
          setChatHistories({});
          setActiveSessionId(newId);
          setRuns([]);
          setConsoleLines([]);
          setSrcDoc('');
          setBuildMs(null);
          setPrData(null);
          setVideoUrl(null);
          setEvents([`[${stamp()}] Fresh workspace ready.`]);
          // Clean diff baseline so the starter shows no stale changes
          // (the pre-reset snapshot stays one step back in History).
          takeSnapshot(fresh);
          setIsNewAgentOpen(false);
          setRightPaneMode('diff');
          showToast('Fresh workspace started — previous work snapshotted in History.');
          void runAgentTurn(newId, prompt);
        }}
        models={modelOptions}
        theme={theme}
      />

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        snapshots={listSnapshots()}
        onRestore={restoreSnapshot}
        theme={theme}
      />

      <ShareModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        link={shareLink}
        canShare={Boolean(user && brokerEnabled() && (projectId || Object.keys(files).length > 0))}
        busy={shareBusy}
        onCreate={() => {
          void createShareLink().then((link) => {
            if (link) showToast(`Share link ready: ${link}`);
            else showToast('Sign in with a cloud project to share.');
          });
        }}
        onRevoke={() => {
          void revokeShareLink();
        }}
        theme={theme}
      />

      <GitHubPushModal
        isOpen={showGithub}
        onClose={() => setShowGithub(false)}
        defaultRepo={projectName}
        onPush={async (repo, isPrivate, token) => {
          const { pushToGithub } = await import('./adapters/github');
          const r = await pushToGithub(repo, isPrivate, filesRef.current, token);
          logEvent('GITHUB', r.url);
          showToast(`Pushed to ${r.url}`);
          return r;
        }}
        theme={theme}
      />

      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        theme={theme}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-neutral-900/95 text-white backdrop-blur-md rounded-full shadow-2xl text-xs font-medium border border-white/10 animate-fadeIn">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );

  async function save(): Promise<void> {
    if (!user || !brokerEnabled()) {
      saveDraft(projectName, filesRef.current);
      setSavedTo('device');
      showToast('Saved to this device (sign in + broker for cloud save).');
      return;
    }
    try {
      if (!projectId) {
        const id = await createProject(projectName, filesRef.current);
        setProjectId(id);
      } else {
        await updateProject(projectId, projectName, filesRef.current);
      }
      setSavedTo('cloud');
      showToast('Saved to cloud.');
      logEvent('SAVE', projectName);
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`);
    }
  }

  async function createShareLink(): Promise<string | null> {
    if (!user || !brokerEnabled() || !projectId) return null;
    setShareBusy(true);
    try {
      let id = projectId;
      if (!id) {
        id = await createProject(projectName, filesRef.current);
        setProjectId(id);
      }
      const token = await setProjectShared(id, true);
      if (!token) return null;
      const link = buildShareLink(token);
      setShareLink(link);
      return link;
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShareLink(): Promise<void> {
    if (!projectId) return;
    setShareBusy(true);
    try {
      await setProjectShared(projectId, false);
      setShareLink(null);
      showToast('Share link revoked.');
    } catch (e) {
      showToast(`Couldn't revoke: ${(e as Error).message}`);
    } finally {
      setShareBusy(false);
    }
  }
}
