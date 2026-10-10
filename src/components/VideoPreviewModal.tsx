import React, { useRef, useState } from 'react';
import { X, Play, Pause, Volume2, Maximize, RotateCcw, Circle } from 'lucide-react';
import screenRecThumb from '../assets/images/screen_recording_thumb_1791421930526.jpg';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Recorded clip URL (blob:). Without it the stage shows the poster. */
  videoSrc?: string | null;
  /** Capture a screen recording, resolving with its playback URL. */
  onStartCapture?: () => Promise<string | null>;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  videoSrc,
  onStartCapture,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!isOpen) return null;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  };

  const startCapture = () => {
    if (!onStartCapture || capturing) return;
    setCaptureError(null);
    setCapturing(true);
    void onStartCapture()
      .then((url) => {
        if (!url) setCaptureError('Capture dismissed — nothing was recorded.');
      })
      .catch((e: unknown) => {
        setCaptureError((e as Error)?.message ?? 'Capture failed.');
      })
      .finally(() => setCapturing(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 max-sm:p-2 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e24] text-white rounded-xl shadow-2xl overflow-hidden border border-white/10 max-sm:w-full max-sm:max-w-full max-sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-10 px-4 bg-[#282830] border-b border-white/10 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2 text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{title ?? 'Screen Recording'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Video Screen Area */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={screenRecThumb}
              className="w-full h-full object-contain"
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                setCurrent(v.currentTime);
                setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
              }}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onClick={togglePlay}
            />
          ) : (
            <>
              <img
                src={screenRecThumb}
                alt="Recording poster"
                className="w-full h-full object-cover filter brightness-95"
              />
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={() => (onStartCapture ? startCapture() : undefined)}
              >
                <div className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-md px-4 py-2 text-white text-xs font-medium hover:scale-105 transition-transform shadow-lg">
                  <Circle size={13} className="text-red-400" />
                  {capturing ? 'Capturing… pick a screen, then stop sharing' : 'Record screen'}
                </div>
              </div>
            </>
          )}

          {/* Play/Pause overlay toggle on click */}
          {videoSrc && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-none"
              onClick={togglePlay}
            >
              {!isPlaying && (
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center pl-1 text-white hover:scale-105 transition-transform shadow-lg pointer-events-auto">
                  <Play size={26} fill="white" />
                </div>
              )}
            </div>
          )}
          {captureError && (
            <div className="absolute bottom-2 left-2 right-2 rounded bg-red-600/90 px-2 py-1 text-[11px] text-white">
              {captureError}
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="p-3 bg-[#1e1e24] space-y-2">
          {/* Progress bar */}
          <div
            className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              const v = videoRef.current;
              if (!v || !v.duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
            }}
          >
            <div
              className="h-full bg-red-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-300 pt-0.5">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="hover:text-white transition-colors"
                disabled={!videoSrc}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (v) v.currentTime = 0;
                  setProgress(0);
                }}
                className="hover:text-white transition-colors"
                title="Restart"
                disabled={!videoSrc}
              >
                <RotateCcw size={14} />
              </button>
              <span className="text-[11px] font-mono text-neutral-400">
                {videoSrc ? `${fmt(current)} / ${fmt(duration)}` : 'No recording yet'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.muted = !v.muted;
                  setMuted(v.muted);
                }}
                className="text-neutral-400 hover:text-white"
                title={muted ? 'Unmute' : 'Mute'}
              >
                <Volume2 size={15} />
              </button>
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (v?.requestFullscreen) void v.requestFullscreen();
                }}
                className="text-neutral-400 hover:text-white"
                title="Fullscreen"
              >
                <Maximize size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
