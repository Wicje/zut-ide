import React, { useState } from 'react';
import mark from '../assets/zut-mark-white.png';
import { HardDrive, Server, X } from 'lucide-react';
import { type AgentMode, getAgentMode, hostedAgentAvailable, setAgentMode } from '../lib/account';

// The step after "you have an account": where should the agent run?
//
// Two homes, one choice:
//   - your machine — opencode (or a zut host) on your own box. Free, your
//     keys, your quota, your files never leave the machine. Works today.
//   - our server   — opencode running for you, no setup. We are bringing the
//     server online; until it is, this card says so instead of pretending.
//
// The choice is a starting point, not a lock: the other one stays available
// from the account menu afterwards.

interface AgentSetupProps {
  onDone: (mode: AgentMode) => void;
  onClose?: () => void;
}

export const AgentSetup: React.FC<AgentSetupProps> = ({ onDone, onClose }) => {
  const [mode, setMode] = useState<AgentMode | null>(getAgentMode());
  const hostedUp = hostedAgentAvailable();

  function choose(m: AgentMode) {
    setMode(m);
    setAgentMode(m);
    onDone(m);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0b0c] text-neutral-100 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src={mark} alt="Zut" className="h-4 w-4" />
          <span className="text-[13px] font-semibold tracking-wide">ZUT</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 flex items-start justify-center px-6 pt-[10vh] pb-10">
        <div className="w-full max-w-[520px]">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            Where should the agent run?
          </h1>
          <p className="text-[15px] text-neutral-500 mt-1">
            The agent writes the files. The question is which machine pays for it — and a phone
            or a 4GB laptop shouldn't have to.
          </p>

          <div className="mt-7 space-y-3">
            {/* Self-host: available now. */}
            <button
              type="button"
              onClick={() => choose('self')}
              className="w-full text-left rounded-xl border border-[#26262b] bg-[#121214] hover:border-[#3a3a40] hover:bg-[#16161a] p-4 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-8 h-8 rounded-lg bg-[#1c1c20] border border-[#2a2a30] flex items-center justify-center shrink-0">
                  <HardDrive size={15} className="text-emerald-400" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">On your machine</span>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-emerald-400/90">
                      Available now
                    </span>
                  </div>
                  <p className="text-[12.5px] text-neutral-500 mt-1 leading-relaxed">
                    Run opencode — or a zut host — on your own computer. Your models, your keys,
                    your quota. Your files never leave the machine, and the terminal is a real PTY.
                  </p>
                </div>
              </div>
            </button>

            {/* Our hosted agent: coming online with the VPS. */}
            <div className="w-full rounded-xl border border-[#232327] bg-[#0f0f11] p-4 opacity-70">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-8 h-8 rounded-lg bg-[#1c1c20] border border-[#2a2a30] flex items-center justify-center shrink-0">
                  <Server size={15} className="text-neutral-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-neutral-300">On our server</span>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                      {hostedUp ? 'Online' : 'Coming soon'}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-neutral-500 mt-1 leading-relaxed">
                    {hostedUp
                      ? 'Our hosted agent, running opencode for you. Nothing to install, billed for what it uses.'
                      : 'Our hosted agent, running opencode for you — no setup, billed for what it uses. We are bringing the server online; self-host works today.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {mode && (
            <p className="mt-4 text-center text-[12px] text-neutral-600">
              You can switch later from the account menu.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
