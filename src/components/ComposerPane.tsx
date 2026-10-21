import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch,
  PanelRightClose,
  Play,
  Copy,
  Check,
  MoreHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  Mic,
  Sparkles,
  Loader2,
  RotateCcw,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  AtSign,
  Shield,
  Layers,
  Clock,
  Brain,
  Pause,
  X,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  ImagePlus,
  FileText,
} from 'lucide-react';
import { SessionData, AgentStep, AgentPhase, ToolApprovalRequest, AttachedContext, AttachedImage } from '../types';
import screenRecThumb from '../assets/images/screen_recording_thumb_1791421930526.jpg';

interface ComposerPaneProps {
  session: SessionData;
  onOpenVideoModal: () => void;
  onCommitPush: () => void;
  onReviewClick: () => void;
  onGenerateEdits: (promptText: string, images?: AttachedImage[]) => void;
  onRollbackCheckpoint?: (checkpointId: string, stepTitle: string) => void;
  /** Open a changed file in the diff pane. */
  onOpenFile?: (path: string) => void;
  onOpenRules?: () => void;
  isGenerating?: boolean;
  theme?: 'light' | 'dark';
  /** Real model options (defaults to the built-in list). */
  models?: string[];
  onModelChange?: (model: string) => void;
  /** Real attachable files for @ mentions. */
  attachableFiles?: Array<{ name: string; tokens: number }>;
  /** Self-host model picker (shown when the opencode model is selected). */
  selfHostLabel?: string;
  opencodeModels?: Array<{ providerID: string; id: string; name: string; free: boolean }>;
  opencodeModel?: { providerID: string; modelID: string } | null;
  onOpencodeModelChange?: (m: { providerID: string; modelID: string } | null) => void;
}

/** Turn ratings (pilot signal: which turns actually helped). Capped, local-only. */
const RATINGS_LS = 'zut:step-ratings';
function readRatings(): Record<string, 1 | -1> {
  try {
    const j = JSON.parse(localStorage.getItem(RATINGS_LS) ?? '{}') as Record<string, unknown>;
    const out: Record<string, 1 | -1> = {};
    for (const [k, v] of Object.entries(j)) {
      if (v === 1 || v === -1) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function downscaleImage(file: File): Promise<AttachedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 1568;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        resolve({ id: `img-${Date.now()}`, name: file.name, mime: 'image/jpeg', dataUrl });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/** Tool events read like the reference UI: Read x, Searched y, Edited z. */
function stepVerb(type: string): string {
  switch (type) {
    case 'read':
      return 'Read';
    case 'search':
      return 'Searched';
    case 'grep':
      return 'Grepped';
    case 'edit':
      return 'Edited';
    case 'test':
      return 'Ran';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export const ComposerPane: React.FC<ComposerPaneProps> = ({
  session,
  onOpenVideoModal,
  onCommitPush,
  onReviewClick,
  onGenerateEdits,
  onRollbackCheckpoint,
  onOpenFile,
  onOpenRules,
  isGenerating = false,
  theme = 'light',
  models,
  onModelChange,
  attachableFiles,
  selfHostLabel,
  opencodeModels,
  opencodeModel,
  onOpencodeModelChange,
}) => {
  const isDark = theme === 'dark';
  const modelOptions = models ?? ['Composer 2.5 Fast', 'Claude 3.7 Sonnet', 'GPT-4.5 Preview', 'Claude 3.5 Haiku'];
  const [copied, setCopied] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [pendingImages, setPendingImages] = useState<AttachedImage[]>([]);
  const [ratings, setRatings] = useState<Record<string, 1 | -1>>(() => readRatings());
  const rateStep = (id: string, v: 1 | -1) => {
    setRatings((prev) => {
      const next = { ...prev, [id]: v };
      try {
        const ids = Object.keys(next).slice(-200);
        localStorage.setItem(RATINGS_LS, JSON.stringify(Object.fromEntries(ids.map((k) => [k, next[k]]))));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedModel, setSelectedModel] = useState(session.model || modelOptions[0]);

  // The composer shows the concrete model when the local agent is selected.
  const modelLabel =
    selectedModel === selfHostLabel && opencodeModel
      ? ((opencodeModels ?? []).find(
          (m) => m.providerID === opencodeModel.providerID && m.id === opencodeModel.modelID,
        )?.name ?? opencodeModel.modelID)
      : selectedModel;
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [opencodeCustom, setOpencodeCustom] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  interface VoiceRecognizer {
    interimResults: boolean;
    lang: string;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    start: () => void;
    stop: () => void;
  }

  const voiceRecRef = useRef<VoiceRecognizer | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Agentic Loop State
  const [isExecutionGraphOpen, setIsExecutionGraphOpen] = useState(false);

  // Attached Context Chips (start empty; files attach from the @ menu)
  const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>([]);
  const [isMentionMenuOpen, setIsMentionMenuOpen] = useState(false);

  useEffect(() => {
    if (session.model) {
      setSelectedModel(session.model);
    } else if (modelOptions[0] && !modelOptions.includes(selectedModel)) {
      setSelectedModel(modelOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.model]);

  function pickModel(model: string) {
    setSelectedModel(model);
    setIsModelDropdownOpen(false);
    onModelChange?.(model);
  }

  const handleCopySummary = () => {
    navigator.clipboard?.writeText(session.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendFollowUp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!followUpText.trim() || isGenerating) return;

    const userText = followUpText.trim();
    setFollowUpText('');
    const images = pendingImages;
    setPendingImages([]);
    onGenerateEdits(userText, images);
  };

  const sendPromptText = (text: string) => {
    const images = pendingImages;
    setPendingImages([]);
    onGenerateEdits(text, images);
  };

  const speechCtor: (new () => VoiceRecognizer) | null =
    typeof window !== 'undefined'
      ? (window as unknown as { SpeechRecognition?: new () => VoiceRecognizer; webkitSpeechRecognition?: new () => VoiceRecognizer }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => VoiceRecognizer }).webkitSpeechRecognition ??
        null
      : null;

  const toggleVoice = () => {
    if (isVoiceRecording) {
      voiceRecRef.current?.stop();
      setIsVoiceRecording(false);
      return;
    }
    if (!speechCtor) return;
    const fail = (msg: string) => {
      setVoiceHint(msg);
      setIsVoiceRecording(false);
      window.setTimeout(() => setVoiceHint(null), 5000);
    };
    try {
      const rec = new speechCtor();
      voiceRecRef.current = rec;
      rec.interimResults = false;
      try {
        rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
      } catch {
        /* ignore */
      }
      rec.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript ?? '';
        if (t) {
          setVoiceHint(null);
          setFollowUpText((v) => (v ? `${v} ${t}` : t));
        }
      };
      rec.onend = () => setIsVoiceRecording(false);
      rec.onerror = (e) => {
        const kind = e?.error ?? '';
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          fail('Microphone blocked — allow it in the browser address bar, then try again.');
        } else if (kind === 'no-speech') {
          fail("Didn't catch that — try again.");
        } else if (kind === 'network') {
          fail('Speech service unreachable — check your connection.');
        } else {
          fail('Voice input failed — try again.');
        }
      };
      rec.start();
      setVoiceHint(null);
      setIsVoiceRecording(true);
    } catch {
      fail('Microphone blocked — allow it in the browser address bar, then try again.');
    }
  };

  const toggleStepExpand = (stepId: string) => {
    setExpandedStepId((prev) => (prev === stepId ? null : stepId));
  };

  const addMentionContext = (name: string, type: 'file' | 'git' | 'doc', tokens?: number) => {
    setAttachedContexts((prev) => {
      if (prev.some((c) => c.name === name)) {
        setIsMentionMenuOpen(false);
        return prev;
      }
      return [...prev, { id: `c-${Date.now()}`, name, type, tokens: tokens ?? 0 }];
    });
    setIsMentionMenuOpen(false);
  };

  return (
    <div className={`h-full min-h-0 flex flex-col justify-between select-none text-[13px] transition-colors ${isDark ? 'bg-[#141416]' : 'bg-[#f4f4f6]'}`}>
      {/* Top Header */}
      <div
        className={`h-10 px-4 border-b flex items-center justify-between ${
          isDark ? 'border-neutral-800 bg-[#161618]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium text-[13px]">
          <span className={isDark ? 'text-white' : 'text-neutral-800'}>
            {session.title}
          </span>
          <GitBranch size={13} className="text-neutral-400 rotate-90" />
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenRules && (
            <button
              onClick={onOpenRules}
              className="text-neutral-400 hover:text-red-500 transition-colors p-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
              title="Project Agent Guidelines"
            >
              <FileCode size={13} />
              <span className="hidden sm:inline font-mono">.rules</span>
            </button>
          )}

          <button
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-1 rounded cursor-pointer"
            title="Collapse pane"
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3.5">
        {/* User Prompt Box */}
        <div
          className={`border rounded-xl p-3 text-[13px] leading-[1.45] shadow-2xs font-normal ${
            isDark
              ? 'bg-[#222227] border-neutral-700 text-neutral-100'
              : 'bg-[#f8f8fa] border-[#e5e5e7] text-neutral-800'
          }`}
        >
          {session.prompt || <span className="text-neutral-400">New agent — send a prompt below to begin.</span>}
          {(session.attachments ?? []).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {(session.attachments ?? []).map((img) => (
                <img
                  key={img.id}
                  src={img.dataUrl}
                  alt={img.name}
                  title={img.name}
                  className="w-12 h-12 rounded-lg object-cover border border-neutral-300 dark:border-neutral-700"
                />
              ))}
            </div>
          )}
        </div>

        {/* Live working indicator (only while the agent runs) */}
        {isGenerating && (
          <div
            className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-xs ${
              isDark ? 'bg-[#1c1c22] border-neutral-700/80' : 'bg-neutral-50/80 border-neutral-200'
            }`}
          >
            <Loader2 size={13} className="text-red-500 animate-spin shrink-0" />
            <span className="text-neutral-600 dark:text-neutral-300">Agent working… steps appear below as they complete.</span>
          </div>
        )}

        {/* Action Steps */}
        {session.steps.length === 0 && !isGenerating && !session.response && (
          <div className="space-y-2 px-1">
            <p className="text-[12px] text-neutral-400">No activity yet — send a prompt below to start the agent.</p>
          </div>
        )}
        <div className="space-y-1.5 text-[12.5px]">
          {session.steps.map((step) => {
            const isExpanded = expandedStepId === step.id;

            return (
              <div key={step.id} className={isExpanded ? 'py-1' : ''}>
                <div
                  onClick={() => toggleStepExpand(step.id)}
                  className="flex items-center justify-between cursor-pointer text-[12px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-neutral-400 shrink-0">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    <span className="truncate">
                      {stepVerb(step.type)}
                      {step.query ? ` ${step.query}` : ''}
                    </span>
                  </div>

                  {step.durationMs != null && (
                    <span className="text-[11px] text-neutral-400 shrink-0 ml-1">
                      {step.durationMs >= 1000
                        ? `${Math.round(step.durationMs / 1000)}s`
                        : `${step.durationMs}ms`}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-1.5 pl-5 space-y-2 text-xs">
                    {step.details && (
                      <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
                        {step.details}
                      </p>
                    )}

                    {step.matches && step.matches.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                          Matched Locations ({step.matches.length})
                        </span>
                        {step.matches.map((m, mi) => (
                          <div
                            key={mi}
                            className={`p-1.5 rounded font-code text-[11px] leading-tight ${
                              isDark ? 'bg-[#18181c] text-neutral-300' : 'bg-white border border-neutral-200 text-neutral-700'
                            }`}
                          >
                            <div className="text-[10px] text-red-500 truncate mb-0.5">
                              {m.file}:{m.line}
                            </div>
                            <div className="truncate text-neutral-500">{m.preview}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {onRollbackCheckpoint && step.checkpointId && (
                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10.5px] text-neutral-400 flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-500" />
                          <span>Snapshot: {step.checkpointId}</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRollbackCheckpoint(step.checkpointId!, `${step.type}: ${step.query}`);
                          }}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            isDark
                              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                              : 'bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-700'
                          }`}
                        >
                          <RotateCcw size={10} />
                          <span>Roll back to step</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* The agent's reply — plain prose */}
        {session.response && (
          <div className="group/reply flex items-start gap-2">
            <p className={`flex-1 text-[13.5px] leading-[1.5] ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
              {session.response}
            </p>
            <button
              onClick={handleCopySummary}
              className="opacity-0 group-hover/reply:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 cursor-pointer shrink-0"
              title={copied ? 'Copied!' : 'Copy reply'}
            >
              {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
          </div>
        )}
        {/* Changed files */}
        {session.files.length > 0 && (
          <div className="space-y-1.5">
            {session.files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onOpenFile?.(file.path)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  isDark
                    ? 'border-neutral-800 hover:border-neutral-700 hover:bg-white/5'
                    : 'border-[#e5e5e7] hover:bg-neutral-50'
                }`}
              >
                <FileText size={12} className="text-neutral-400 shrink-0" />
                <span className="text-[12px] truncate flex-1">{file.path}</span>
                {file.additions > 0 && (
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                    +{file.additions}
                  </span>
                )}
                {file.deletions > 0 && (
                  <span className="text-[11px] font-mono text-red-600 dark:text-red-400 shrink-0">
                    -{file.deletions}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {session.processedItem && (
          <div className="flex items-center gap-1.5 text-[12.5px]">
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Processed</span>
            <span className="text-neutral-500 font-normal">{session.processedItem}</span>
          </div>
        )}

        {session.videoPreview && (
          <div
            onClick={onOpenVideoModal}
            className={`relative group rounded-xl overflow-hidden border aspect-[16/10] cursor-pointer shadow-2xs transition-all ${
              isDark
                ? 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
                : 'border-[#e5e5e7] bg-[#f2f2f5] hover:border-neutral-400'
            }`}
          >
            <img
              src={screenRecThumb}
              alt="Processed screen recording"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/15 transition-colors" />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-neutral-900/75 backdrop-blur-xs text-white flex items-center justify-center shadow-md transition-all group-hover:scale-110 pl-0.5">
                <Play size={18} fill="currentColor" />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom Controls, Context Chips & Follow-up Input */}
      <div
        className={`p-3 border-t space-y-2.5 shrink-0 ${
          isDark ? 'border-neutral-800 bg-[#18181b]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        {/* Attached Context Chips Bar */}
        {attachedContexts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {attachedContexts.map((ctx) => (
              <div
                key={ctx.id}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono border ${
                  isDark
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-300'
                    : 'bg-neutral-100 border-neutral-300 text-neutral-700'
                }`}
              >
                <span>@{ctx.name}</span>
                <span className="text-neutral-400">({ctx.tokens}t)</span>
                <button
                  onClick={() => setAttachedContexts(attachedContexts.filter((c) => c.id !== ctx.id))}
                  className="hover:text-red-500 ml-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar with Context Mention Button */}
        <form
          onSubmit={handleSendFollowUp}
          className={`relative flex items-center justify-between pl-2 pr-1.5 py-1.5 rounded-2xl border shadow-2xs transition-all ${
            isDark
              ? 'bg-[#222227] border-neutral-700 focus-within:border-red-500'
              : 'bg-white border-[#e5e5e7] focus-within:border-red-500'
          }`}
        >
          {/* @ Mention Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMentionMenuOpen(!isMentionMenuOpen)}
              className="w-5 h-5 rounded-md flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Attach context (@)"
            >
              <AtSign size={13} />
            </button>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              aria-label="Attach images"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).slice(0, 3);
                e.target.value = '';
                if (list.length === 0) return;
                void Promise.all(list.map((f) => downscaleImage(f)))
                  .then((imgs) => setPendingImages((prev) => [...prev, ...imgs].slice(0, 3)))
                  .catch(() => {});
              }}
            />
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              className="w-5 h-5 rounded-md flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Attach images (seen by Gemini, OpenRouter, Claude, ChatGPT)"
            >
              <ImagePlus size={13} />
            </button>

            {isMentionMenuOpen && (
              <div
                className={`absolute left-0 bottom-full mb-2 w-48 border rounded-xl shadow-xl py-1 z-30 text-[11.5px] ${
                  isDark ? 'bg-[#222228] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold text-neutral-400 uppercase">
                  Attach Context
                </div>
                {(attachableFiles ?? []).length === 0 && (
                  <div className="px-2.5 py-1 text-neutral-400">No files in this project yet.</div>
                )}
                {(attachableFiles ?? []).map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => addMentionContext(f.name, 'file', f.tokens)}
                    className="w-full text-left px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between"
                  >
                    <span>@{f.name}</span>
                    <span className="text-neutral-400 text-[10px]">file</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pending image attachments */}
          {pendingImages.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-12 h-12 rounded-lg object-cover border border-neutral-300 dark:border-neutral-700"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingImages((prev) => prev.filter((p) => p.id !== img.id))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center cursor-pointer"
                    title={`Remove ${img.name}`}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Follow up text input */}
          <input
            type="text"
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            disabled={isGenerating}
            placeholder={isGenerating ? 'Synthesizing code...' : 'Plan, search, build anything...'}
            className={`flex-1 px-2 text-[12.5px] max-sm:text-base bg-transparent focus:outline-none placeholder-neutral-400 ${
              isDark ? 'text-white' : 'text-neutral-800'
            }`}
          />

          {/* Model selector dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className={`flex items-center gap-1 text-[11.5px] px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                isDark ? 'text-neutral-300 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>{modelLabel}</span>
              <ChevronDown size={11} className="text-neutral-400" />
            </button>

            {isModelDropdownOpen && (
              <div
                className={`absolute right-0 bottom-full mb-2 w-48 border rounded-lg shadow-xl py-1 z-30 text-[12px] ${
                  isDark ? 'bg-[#222228] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                {selectedModel === selfHostLabel && (opencodeModels ?? []).length > 0 ? (
                  <>
                    {(opencodeModels ?? []).map((m) => {
                      const id = `${m.providerID}/${m.id}`;
                      const on = opencodeModel?.providerID === m.providerID && opencodeModel?.modelID === m.id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            onOpencodeModelChange?.({ providerID: m.providerID, modelID: m.id });
                            setIsModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer ${
                            isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                          } ${on ? 'font-medium text-red-500' : ''}`}
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="text-[10px] text-neutral-400 shrink-0">
                            {m.providerID}
                            {m.free ? ' · free' : ''}
                          </span>
                        </button>
                      );
                    })}
                    <div className="px-2 py-1.5 border-t border-neutral-200/60 dark:border-neutral-800">
                      <input
                        value={opencodeCustom}
                        onChange={(e) => setOpencodeCustom(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          const v = opencodeCustom.trim();
                          const i = v.indexOf('/');
                          if (i > 0) {
                            onOpencodeModelChange?.({
                              providerID: v.slice(0, i).trim(),
                              modelID: v.slice(i + 1).trim(),
                            });
                            setOpencodeCustom('');
                            setIsModelDropdownOpen(false);
                          }
                        }}
                        placeholder="provider/model-id, Enter to use"
                        spellCheck={false}
                        aria-label="Custom model ID"
                        className={`w-full px-2 py-1 rounded-md border font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-red-500 ${
                          isDark
                            ? 'bg-transparent border-neutral-700 text-neutral-300 placeholder-neutral-600'
                            : 'bg-transparent border-neutral-300 text-neutral-600 placeholder-neutral-400'
                        }`}
                      />
                    </div>
                  </>
                ) : (
                  modelOptions.map(
                    (model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => pickModel(model)}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between cursor-pointer ${
                          isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        } ${selectedModel === model ? 'font-medium text-red-500' : ''}`}
                      >
                        <span>{model}</span>
                        {selectedModel === model && <Check size={12} />}
                      </button>
                    )
                  )
                )}
              </div>
            )}
          </div>

          {/* Mic / send action button (mic hidden where speech input is unsupported) */}
          {(followUpText || speechCtor) && (
          <button
            type="button"
            onClick={followUpText ? handleSendFollowUp : toggleVoice}
            disabled={isGenerating}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer shadow-xs ${
              isVoiceRecording
                ? 'bg-red-500 text-white animate-pulse'
                : isDark
                ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                : 'bg-neutral-900 text-white hover:bg-black'
            }`}
            title={followUpText ? 'Send message' : 'Voice dictation'}
          >
            {isGenerating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : followUpText ? (
              <Sparkles size={11} />
            ) : (
              <Mic size={12} />
            )}
          </button>
          )}
        </form>
        {voiceHint && (
          <p className="px-4 pb-2 text-[11px] text-red-500">{voiceHint}</p>
        )}
      </div>
    </div>
  );
};
