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
import { RulesModal } from './components/RulesModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import type {
  AgentStep,
  DiffViewMode,
  ThemeMode,
  SessionData,
  SidebarSection,
  RightPaneMode,
  TestCase,
  AttachedImage,
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
  saveSessionBackup,
  loadSessionBackup,
  loadRules,
  saveRules,
  deployStatic,
} from './adapters/zut';
import { geminiTurn, getGeminiKey, setGeminiKey } from './adapters/gemini';
import { useMediaQuery } from './lib/useMediaQuery';
import { getProviderKey, setProviderKey, clearProviderKey, getVercelToken, setVercelToken, clearVercelToken, type DirectProvider } from './adapters/providers';
import { getConnectorKey } from './lib/connectors';
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
  MessagesSquare,
  Code,
  Folder,
  Image,
  PanelLeftOpen,
} from 'lucide-react';

const STARTER: FileMap = {};

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
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isPRModalOpen, setIsPRModalOpen] = useState(false);
  const [isPRStudioOpen, setIsPRStudioOpen] = useState(false);
  const [isVercelDeployOpen, setIsVercelDeployOpen] = useState(false);
  const [isLoginAccountOpen, setIsLoginAccountOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [mobileTab, setMobileTab] = useState<'files' | 'agent' | 'code'>('agent');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [wallpaperOn, setWallpaperOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('zut:wallpaper') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleWallpaper = () => {
    setWallpaperOn((v) => {
      const next = !v;
      try {
        localStorage.setItem('zut:wallpaper', next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const [wallpaperChoice, setWallpaperChoice] = useState<'auto' | 'light' | 'dark' | 'custom'>(() => {
    try {
      const c = localStorage.getItem('zut:wallpaper-choice');
      return c === 'light' || c === 'dark' || c === 'custom' ? c : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zut:wallpaper-custom');
    } catch {
      return null;
    }
  });
  const [wallpaperMenuOpen, setWallpaperMenuOpen] = useState(false);
  const chooseWallpaper = (c: 'auto' | 'light' | 'dark' | 'custom') => {
    setWallpaperChoice(c);
    try {
      localStorage.setItem('zut:wallpaper-choice', c);
    } catch {
      /* ignore */
    }
    setWallpaperMenuOpen(false);
  };
  const handleWallpaperUpload = (fl: FileList | null) => {
    const f = fl?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      showToast('Pick an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      if (!url) return;
      try {
        localStorage.setItem('zut:wallpaper-custom', url);
      } catch {
        showToast('Image too large to keep — try a smaller one.');
        return;
      }
      setCustomWallpaper(url);
      chooseWallpaper('custom');
      showToast('Wallpaper updated.');
    };
    reader.readAsDataURL(f);
  };

  // Tablet/narrow defaults: slimmer rails so the 3-column shell still fits.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1100) {
      setSidebarWidth(180);
      setComposerWidth(320);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [netlifyKeySet, setNetlifyKeySet] = useState(() => getVercelToken() !== null);
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
  const [projectName, setProjectName] = useState(() => loadDraft()?.name ?? 'Untitled project');
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

  // Sign-in: back up device work to the cloud first, then open the latest
  // cloud project. Device files are never silently replaced — the `same`
  // guard also makes re-runs (reload, token refresh) no-ops.
  useEffect(() => {
    if (!user || !brokerEnabled()) return;
    listProjects()
      .then((rows) => {
        const local = { ...filesRef.current };
        const localCount = Object.keys(local).length;
        const latest = rows[0];
        const same =
          latest &&
          JSON.stringify(Object.keys(local).sort().map((k) => [k, local[k]])) ===
            JSON.stringify(Object.keys(latest.files ?? {}).sort().map((k) => [k, (latest.files as Record<string, string>)[k]]));
        if (same && latest) {
          setProjectId(latest.id);
          setSavedTo('cloud');
          if (latest.share_token) setShareLink(buildShareLink(latest.share_token));
          return;
        }
        if (localCount > 0) {
          takeSnapshot(local);
          // Reuse the previous device backup instead of littering a new one.
          const backupName = `${projectName} (this device)`;
          const existing = rows.find((r) => r.name === backupName);
          if (existing) {
            updateProject(existing.id, backupName, local).catch(() => {});
          } else {
            createProject(backupName, local).catch(() => {});
          }
        }
        if (!latest) {
          if (localCount > 0) showToast('Signed in — device work kept and backed up to the cloud.');
          return;
        }
        setProjectId(latest.id);
        setSavedTo('cloud');
        if (latest.share_token) setShareLink(buildShareLink(latest.share_token));
        setFiles({ ...latest.files });
        setProjectName(latest.name);
        takeSnapshot({ ...latest.files });
        showToast(
          localCount > 0
            ? `Signed in — device work backed up as "${projectName} (this device)". Opened cloud project "${latest.name}".`
            : `Opened cloud project "${latest.name}"`,
        );
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

  // ---- Real sessions (agent conversations; no fixtures; survive reload) ----
  const [sessions, setSessions] = useState<Record<string, SessionData>>(() => {
    const backup = loadSessionBackup();
    if (backup && Object.keys(backup.sessions).length > 0) return backup.sessions;
    const id = 'session-1';
    return { [id]: blankSession(id, 'New agent', 'Gemini 2.5 Flash') };
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const backup = loadSessionBackup();
    if (backup && backup.sessions[backup.activeId]) return backup.activeId;
    return 'session-1';
  });
  const [sessionBases, setSessionBases] = useState<Record<string, FileMap>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMsg[]>>(
    () => (loadSessionBackup()?.chats as Record<string, ChatMsg[]> | undefined) ?? {},
  );
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  // Sessions + chats survive reload (quota-safe, capped at 10).
  useEffect(() => {
    saveSessionBackup(sessions, chatHistories, activeSessionId);
  }, [sessions, chatHistories, activeSessionId]);
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
  async function runAgentTurn(sessionId: string, promptText: string, images: AttachedImage[] = []) {
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
        if (images.length > 0) {
          showToast('Self-host turns can’t see images yet — describe it in words.');
        }
        const { opencodeTurn } = await import('./adapters/opencode');
        const { buildSystemPrompt } = await import('./adapters/gemini');
        const r = await opencodeTurn(
          base,
          promptText,
          buildSystemPrompt(projectName, base, activeFilePath),
          () => {},
          opencodeModel ?? undefined,
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
        const withPrompt = [...history, { role: 'user' as const, content: promptText }];
        let acc = '';
        await streamProvider(
          provider,
          withPrompt,
          buildSystemPrompt(projectName, base, activeFilePath),
          (d) => {
            acc += d;
          },
          undefined,
          images.map((i) => ({ mime: i.mime, base64: i.dataUrl.split(',')[1] ?? '' })),
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
          images: images.map((i) => ({ mime: i.mime, base64: i.dataUrl.split(',')[1] ?? '' })),
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
      const msg = (e as Error).message;
      // Missing-key failures land where keys live instead of dying quietly.
      if (/api key/i.test(msg)) setIsLoginAccountOpen(true);
      pushStep({
        id: `step-${Date.now()}`,
        type: 'edit',
        query: promptText.slice(0, 64),
        status: 'failed',
        details: msg,
      });
      showToast(`Agent failed: ${msg}`);
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
        startNewProject();
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
  const [opencodeModels, setOpencodeModels] = useState<Array<{ providerID: string; id: string; name: string; free: boolean }>>([]);
  const [opencodeModel, setOpencodeModel] = useState<{ providerID: string; modelID: string } | null>(null);
  useEffect(() => {
    void import('./adapters/opencode').then(({ selfHostReady, listOpencodeModels, getOpencodeModel }) => {
      selfHostReady()
        .then((ok) => {
          setOpencodeReady(ok);
          if (!ok) return;
          setOpencodeModel(getOpencodeModel());
          listOpencodeModels()
            .then(setOpencodeModels)
            .catch(() => {});
        })
        .catch(() => {});
    });
  }, []);

  const changeOpencodeModel = (m: { providerID: string; modelID: string } | null) => {
    setOpencodeModel(m);
    void import('./adapters/opencode').then(({ setOpencodeModel }) => setOpencodeModel(m));
  };

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

  // Start a blank project immediately — no modal. Old sessions stay in the
  // sidebar, outgoing files were snapshotted, model carries over.
  function startNewProject() {
    takeSnapshot(filesRef.current);
    const fresh = { ...STARTER };
    const newId = `session-${Date.now()}`;
    const newSession = blankSession(newId, 'New project', activeSession?.model ?? 'Gemini 2.5 Flash');
    generatingRef.current = false;
    setIsGenerating(false);
    setFiles(fresh);
    setProjectName('Untitled project');
    setProjectId(null);
    setShareLink(null);
    setSavedTo('device');
    setActiveFilePath(Object.keys(fresh).sort()[0] ?? 'index.html');
    setSessions((prev) => ({ ...prev, [newId]: newSession }));
    setActiveSessionId(newId);
    if (isMobile) setMobileTab('agent');
    setRuns([]);
    setConsoleLines([]);
    setSrcDoc('');
    setBuildMs(null);
    setPrData(null);
    setVideoUrl(null);
    setEvents([`[${stamp()}] New project started.`]);
    takeSnapshot(fresh);
    setRightPaneMode('editor');
    showToast('New project started — old work kept in the sidebar + History.');
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
  const effectiveWallpaper = !wallpaperOn
    ? undefined
    : wallpaperChoice === 'custom' && customWallpaper
    ? customWallpaper
    : wallpaperChoice === 'light'
    ? lightWallpaperImg
    : wallpaperChoice === 'dark'
    ? darkWallpaperImg
    : currentWallpaper;

  return (
    <div
      className={`relative w-screen h-dvh overflow-hidden flex flex-col items-center justify-center bg-cover bg-center select-none transition-colors duration-500 ${
        isDark ? 'dark' : ''
      }`}
      style={{
        backgroundImage: effectiveWallpaper ? `url(${effectiveWallpaper})` : undefined,
        backgroundColor: isDark ? '#141416' : '#6c798a',
      }}
    >
      {/* Top Floating Control Bar */}
      <div className="relative z-40 w-full flex justify-start sm:justify-center px-4 pt-3 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0 bg-black/45 dark:bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-white/90 text-xs shadow-xl border border-white/10 transition-opacity hover:opacity-100 opacity-80">
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
          {isDark ? <Sun size={12} className="text-amber-400" /> : <Moon size={12} className="text-red-300" />}
        </button>

        <span className="text-white/20 text-xs">|</span>

        <button
          onClick={() => setWallpaperMenuOpen((v) => !v)}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
          title="Wallpaper"
        >
          <Image size={12} className={wallpaperMenuOpen ? 'text-white' : wallpaperOn ? 'text-white/90' : 'text-white/40'} />
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
        {wallpaperMenuOpen && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-60 rounded-xl border border-white/10 bg-black/75 backdrop-blur-md p-2 text-white/90 text-xs shadow-xl">
            {(['auto', 'light', 'dark'] as const).map((c) => (
              <button
                key={c}
                onClick={() => chooseWallpaper(c)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer capitalize"
              >
                <span>{c === 'auto' ? 'Auto (follows theme)' : `${c[0].toUpperCase()}${c.slice(1)} wallpaper`}</span>
                {wallpaperChoice === c && <span className="text-red-400">✓</span>}
              </button>
            ))}
            {customWallpaper && (
              <button
                onClick={() => chooseWallpaper('custom')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span>Custom photo</span>
                {wallpaperChoice === 'custom' && <span className="text-red-400">✓</span>}
              </button>
            )}
            <label className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
              <span>Upload custom…</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleWallpaperUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="h-px bg-white/10 my-1" />
            <button
              onClick={() => {
                toggleWallpaper();
                setWallpaperMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span>{wallpaperOn ? 'Hide wallpaper' : 'Show wallpaper'}</span>
              {!wallpaperOn && <span className="text-red-400">✓</span>}
            </button>
          </div>
        )}
      </div>

      {/* Main Zut App Window with Interactive Drag Handles */}
      <div
        ref={containerRef}
        className={`relative z-10 transition-all duration-100 ease-out flex shadow-2xl overflow-hidden border ${
          isMobile || isMaximized
            ? 'w-full flex-1 min-h-0 rounded-none border-none'
            : 'w-[96vw] max-w-[1240px] h-[88vh] max-h-[800px] rounded-2xl shadow-2xl shadow-black/50 border-black/15'
        } ${isMobile ? 'flex-col' : ''}`}
        style={{
          boxShadow: isMaximized || isMobile
            ? 'none'
            : isDark
            ? '0 30px 70px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            : '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.12)',
        }}
      >
        {/* Left Column: Sidebar with Dynamic Width */}
        <div
          style={isMobile ? undefined : { width: `${sidebarCollapsed ? 44 : sidebarWidth}px` }}
          className={`shrink-0 overflow-hidden flex flex-col ${
            isMobile ? (mobileTab === 'files' ? 'w-full h-full' : 'hidden') : 'h-full'
          }`}
        >
          {sidebarCollapsed && !isMobile ? (
            <div
              className={`w-full h-full flex flex-col items-center pt-2 border-r ${
                isDark ? 'bg-[#141416] border-neutral-800' : 'bg-[#f4f4f6] border-[#e5e5e7]'
              }`}
            >
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="hover:text-neutral-700 dark:hover:text-neutral-200 text-neutral-400 p-0.5 rounded transition-colors cursor-pointer"
                title="Expand sidebar"
              >
                <PanelLeftOpen size={14} strokeWidth={2} />
              </button>
            </div>
          ) : (
          <Sidebar
            sections={sections}
            activeItem={activeSessionId}
            onSelectItem={(id) => {
              if (id.startsWith('file:')) {
                setActiveFilePath(id.slice(5));
                setRightPaneMode('editor');
                if (isMobile) setMobileTab('code');
              } else if (sessions[id]) {
                setActiveSessionId(id);
                if (isMobile) setMobileTab('agent');
                showToast(`Switched session to ${sessions[id].title}`);
              }
            }}
            onNewAgent={startNewProject}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenAccount={() => setIsLoginAccountOpen(true)}
            onOpenRules={() => setIsRulesModalOpen(true)}
            user={user}
            theme={theme}
            onToggleSidebar={() => setSidebarCollapsed(true)}
          />
          )}
        </div>

        {/* Feature 1: Draggable Resizer 1 (Between Sidebar & Composer) */}
        <div
          onMouseDown={() => setIsResizingSidebar(true)}
          onDoubleClick={() => setSidebarWidth(210)}
          className={`w-1 shrink-0 h-full cursor-col-resize transition-colors relative z-20 hover:bg-red-500/50 ${
            isMobile || sidebarCollapsed ? 'hidden' : isResizingSidebar ? 'bg-red-600' : isDark ? 'bg-neutral-800' : 'bg-neutral-200'
          }`}
          title="Drag to resize sidebar (Double-click to reset)"
        />

        {/* Middle Column: Composer Ghost Chat Pane with Dynamic Width */}
        <div
          style={isMobile ? undefined : { width: `${composerWidth}px` }}
          className={`shrink-0 overflow-hidden flex flex-col ${
            isMobile ? (mobileTab === 'agent' ? 'w-full h-full' : 'hidden') : 'h-full'
          }`}
        >
          <ComposerPane
            session={activeSession}
            models={modelOptions}
            selfHostLabel={OPENCODE_LABEL}
            opencodeModels={opencodeModels}
            opencodeModel={opencodeModel}
            onOpencodeModelChange={changeOpencodeModel}
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
              if (isMobile) setMobileTab('code');
              showToast('Focusing SCM diff review pane');
            }}
            onGenerateEdits={(prompt, images) => {
              if (images && images.length > 0) {
                setSessions((prev) => {
                  const s = prev[activeSessionId];
                  if (!s) return prev;
                  return { ...prev, [activeSessionId]: { ...s, attachments: [...(s.attachments ?? []), ...images] } };
                });
              }
              void runAgentTurn(activeSessionId, prompt, images ?? []);
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
          className={`w-1 shrink-0 h-full cursor-col-resize transition-colors relative z-20 hover:bg-red-500/50 ${
            isMobile ? 'hidden' : isResizingComposer ? 'bg-red-600' : isDark ? 'bg-neutral-800' : 'bg-neutral-200'
          }`}
          title="Drag to resize composer pane (Double-click to reset)"
        />

        {/* Right Column: Dynamic Pane Selection (flex-1) */}
        <div
          className={`flex-1 overflow-hidden flex flex-col ${
            isMobile ? (mobileTab === 'code' ? 'w-full h-full' : 'hidden') : 'h-full'
          }`}
        >
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
              onCreateFile={() => {
                try {
                  const existing = filesRef.current;
                  let n = Object.keys(existing).length + 1;
                  let name = `untitled-${n}.html`;
                  while (existing[name]) {
                    n += 1;
                    name = `untitled-${n}.html`;
                  }
                  setFiles((prev) => ({ ...prev, [name]: '' }));
                  setActiveFilePath(name);
                  showToast(`Created ${name} — name it below.`);
                  return name;
                } catch (e) {
                  showToast(`Could not create file: ${(e as Error).message}`);
                  return null;
                }
              }}
              onCreateFolder={() => {
                try {
                  const existing = filesRef.current;
                  let f = 1;
                  let folder = 'new-folder';
                  while (Object.keys(existing).some((k) => k === folder || k.startsWith(`${folder}/`))) {
                    f += 1;
                    folder = `new-folder-${f}`;
                  }
                  let n = 1;
                  let name = `${folder}/untitled-${n}.html`;
                  while (existing[name]) {
                    n += 1;
                    name = `${folder}/untitled-${n}.html`;
                  }
                  setFiles((prev) => ({ ...prev, [name]: '' }));
                  setActiveFilePath(name);
                  showToast(`Created ${name} — name it below.`);
                  return name;
                } catch (e) {
                  showToast(`Could not create folder: ${(e as Error).message}`);
                  return null;
                }
              }}
              onSuggestPrompt={(p) => {
                void runAgentTurn(activeSessionId, p);
              }}
              onRenameFile={(oldId, newId) => {
                const clean = newId.trim().replace(/^\/+/, '');
                if (!clean || clean === oldId) return;
                if (filesRef.current[clean]) {
                  showToast('A file with that name already exists.');
                  return;
                }
                takeSnapshot(filesRef.current);
                setFiles((prev) => {
                  const next = { ...prev };
                  next[clean] = next[oldId] ?? '';
                  delete next[oldId];
                  return next;
                });
                if (activeFilePath === oldId) setActiveFilePath(clean);
                showToast(`Renamed to ${clean.split('/').pop()}`);
              }}
              onDeleteFile={(fileId) => {
                takeSnapshot(filesRef.current);
                setFiles((prev) => {
                  const next = { ...prev };
                  delete next[fileId];
                  return next;
                });
                const rest = Object.keys(filesRef.current).filter((k) => k !== fileId).sort();
                setActiveFilePath(rest[0] ?? 'index.html');
                showToast(`Deleted ${fileId.split('/').pop()}`);
              }}
              onDuplicateFile={(fileId) => {
                const dot = fileId.lastIndexOf('.');
                const base = dot > 0 ? fileId.slice(0, dot) : fileId;
                const ext = dot > 0 ? fileId.slice(dot) : '';
                let n = 2;
                let name = `${base}-copy${ext}`;
                while (filesRef.current[name]) {
                  n += 1;
                  name = `${base}-copy-${n}${ext}`;
                }
                takeSnapshot(filesRef.current);
                setFiles((prev) => ({ ...prev, [name]: prev[fileId] ?? '' }));
                setActiveFilePath(name);
                showToast(`Duplicated as ${name.split('/').pop()}`);
              }}
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

        {/* Mobile bottom nav: one pane at a time on small screens */}
        {isMobile && (
          <div
            className={`shrink-0 h-14 px-2 flex items-center justify-around border-t ${
              isDark ? 'border-neutral-800 bg-[#141416]' : 'border-[#e5e5e7] bg-[#f4f4f6]'
            }`}
          >
            {(
              [
                { id: 'files', label: 'Files', Icon: Folder },
                { id: 'agent', label: 'Agent', Icon: MessagesSquare },
                { id: 'code', label: 'Code', Icon: Code },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setMobileTab(id)}
                className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
                  mobileTab === id
                    ? 'text-red-500'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
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
          onLog('Uploading to Vercel…');
          const { url } = await deployStatic(filesRef.current, { name: projectName, token: getVercelToken() });
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
        deployKeySet={netlifyKeySet}
        onSaveDeployKey={(key) => {
          setVercelToken(key);
          setNetlifyKeySet(true);
          showToast('Vercel token saved in this browser.');
        }}
        onClearDeployKey={() => {
          clearVercelToken();
          setNetlifyKeySet(false);
          showToast('Vercel token removed.');
        }}
        theme={theme}
      />

      <RulesModal
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
        onNewAgent={startNewProject}
        onOpenDeploy={() => setIsVercelDeployOpen(true)}
        onOpenAccount={() => setIsLoginAccountOpen(true)}
        onOpenHistory={() => setShowHistory(true)}
        onShare={() => setShowShare(true)}
        onImportUrl={() => setShowImport(true)}
        onPushGithub={() => setShowGithub(true)}
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
        initialToken={getConnectorKey('github') ?? undefined}
        onPush={async (repo, isPrivate, token, opts) => {
          const { pushToGithub, createPullRequest, defaultPushMessage } = await import('./adapters/github');
          const r = await pushToGithub(repo, isPrivate, filesRef.current, token, opts);
          logEvent('GITHUB', r.url);
          let prUrl: string | null = null;
          if (r.branch !== r.defaultBranch) {
            const title = opts.message?.trim() || defaultPushMessage(r.repo);
            try {
              const pr = await createPullRequest(r.owner, r.repo, r.branch, r.defaultBranch, title, token);
              prUrl = pr.url;
              logEvent('GITHUB', `PR ${pr.url}`);
            } catch (e) {
              showToast(`Pushed — PR step said: ${(e as Error).message}`);
            }
          }
          showToast(prUrl ? `Pushed + PR opened: ${prUrl}` : `Pushed to ${r.url}`);
          return { url: prUrl ?? r.url, prUrl };
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
