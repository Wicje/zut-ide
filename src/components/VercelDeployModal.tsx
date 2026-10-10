import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  Globe,
  GitBranch,
  Terminal,
  Zap,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface VercelDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  theme?: 'light' | 'dark';
  /** Real deploy channel: streams log lines, resolves with the live URL. */
  onDeploy?: (onLog: (line: string) => void) => Promise<{ url: string }>;
  deployError?: string | null;
  onPushGithub?: () => void;
}

export const VercelDeployModal: React.FC<VercelDeployModalProps> = ({
  isOpen,
  onClose,
  branchName = 'workspace',
  theme = 'light',
  onDeploy,
  deployError,
  onPushGithub,
}) => {
  const isDark = theme === 'dark';
  const [deployState, setDeployState] = useState<'idle' | 'building' | 'deployed'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentUrl, setDeploymentUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartDeploy = () => {
    if (!onDeploy) {
      setError('Deploy backend is not configured.');
      return;
    }
    setDeployState('building');
    setLogs([]);
    setError(null);
    void onDeploy((line) => {
      setLogs((prev) => [...prev.slice(-200), line]);
    })
      .then(({ url }) => {
        setDeploymentUrl(url);
        setLogs((prev) => [...prev.slice(-200), `✓ Live at ${url}`]);
        setDeployState('deployed');
      })
      .catch((e: unknown) => {
        setError((e as Error)?.message ?? 'Deploy failed.');
        setDeployState('idle');
      });
  };

  const handleCopyUrl = () => {
    if (!deploymentUrl) return;
    navigator.clipboard?.writeText(deploymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 max-sm:p-2 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden transition-all max-sm:w-full max-sm:max-w-full max-sm:max-h-[calc(100dvh-2rem)] ${
          isDark
            ? 'bg-[#18181c] border-neutral-700 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`h-12 px-4 border-b flex items-center justify-between ${
            isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-black dark:bg-white rounded flex items-center justify-center text-white dark:text-black">
              <Globe size={12} />
            </div>
            <span className="font-semibold text-xs">Deploy to the web</span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          {/* Target Metadata Card */}
          <div
            className={`p-3 rounded-xl border space-y-2 ${
              isDark ? 'bg-[#222228] border-neutral-700' : 'bg-neutral-50 border-neutral-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                <GitBranch size={13} className="text-red-500" />
                <span className="font-semibold">{branchName}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                Ready to publish
              </span>
            </div>

            <p className="text-[11.5px] text-neutral-500">
              Publishes this project to a live Vercel URL using your Vercel token (free at vercel.com → Settings → Tokens). Add it once in your Zut account, then publish as often as you like.
            </p>
          </div>

          {/* Idle State Banner */}
          {deployState === 'idle' && (
            <div className="py-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center">
                <Zap size={24} />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Publish this project</h4>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                  Uploads the project and gives you a live shareable URL.
                </p>
              </div>

              {(error || deployError) && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400 max-w-sm mx-auto">
                  {error ?? deployError}
                </div>
              )}

              <button
                onClick={handleStartDeploy}
                disabled={!onDeploy}
                className="px-4 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black font-semibold text-xs shadow-md hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-40"
                title={onDeploy ? 'Publish now' : 'Deploy backend is not configured'}
              >
                <span>Publish live URL</span>
                <ArrowRight size={13} />
              </button>
              {onPushGithub && (
                <button
                  onClick={() => {
                    onClose();
                    onPushGithub();
                  }}
                  className="mx-auto block text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline-offset-2 hover:underline"
                >
                  or push the code to GitHub instead
                </button>
              )}
            </div>
          )}

          {/* Building State Progress */}
          {deployState === 'building' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-red-500" />
                  <span>Publishing…</span>
                </div>
                <span className="font-mono text-neutral-400">{logs.length} log lines</span>
              </div>

              {/* Terminal Logs Box */}
              <div
                className={`p-2.5 rounded-lg font-code text-[11px] leading-relaxed max-h-36 overflow-y-auto ${
                  isDark ? 'bg-black/60 text-neutral-300' : 'bg-neutral-900 text-neutral-200'
                }`}
              >
                {logs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* Deployed State */}
          {deployState === 'deployed' && (
            <div className="space-y-3.5 py-1 animate-fadeIn">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={18} className="shrink-0" />
                <div className="leading-tight">
                  <div className="font-semibold text-xs">Deployment Complete!</div>
                  <div className="text-[11px] opacity-80">
                    Your project is live at the URL below.
                  </div>
                </div>
              </div>

              {/* Preview Card */}
              <div
                className={`p-3 rounded-xl border space-y-2.5 ${
                  isDark ? 'bg-[#222228] border-neutral-700' : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Globe size={13} className="text-red-500" />
                    <span>Domain:</span>
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                  >
                    {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-neutral-700 font-mono text-[11.5px]">
                  <span className="text-red-600 dark:text-red-400 truncate">
                    {deploymentUrl}
                  </span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(deploymentUrl, '_blank');
                    }}
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white ml-2"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleStartDeploy}
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw size={11} />
                  <span>Redeploy</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => {
                      window.open(deploymentUrl, '_blank');
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black font-semibold shadow-sm hover:opacity-90 flex items-center gap-1.5"
                  >
                    <span>Visit Preview</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
