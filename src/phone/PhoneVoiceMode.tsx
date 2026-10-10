import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Mic, MoreVertical, Pause, Play, Volume2, X } from 'lucide-react';
import { PhoneOrb } from './PhoneOrb';
import { toast } from 'sonner';

interface PhoneVoiceModeProps {
  onClose: () => void;
  onVoiceTranscription: (text: string) => void;
}

export const PhoneVoiceMode: React.FC<PhoneVoiceModeProps> = ({
  onClose,
  onVoiceTranscription,
}) => {
  // Start session timer at 00:00
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcribedText, setTranscribedText] = useState('Listening... Speak to Aura');
  const recognitionRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef('');
  const restartTimeoutRef = useRef<any>(null);

  // Keep latest callbacks in refs so the recognizer is created once per mount, not on every parent render.
  const onTranscriptionRef = useRef(onVoiceTranscription);
  const onCloseRef = useRef(onClose);
  onTranscriptionRef.current = onVoiceTranscription;
  onCloseRef.current = onClose;

  // Timer: counts up from 00:00
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Real Web Speech Recognition (Continuous with safe auto-reconnect)
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setTranscribedText('Tap the microphone button to ask anything');
      return;
    }

    let isComponentMounted = true;

    const initSession = () => {
      if (!isComponentMounted || isPaused) return;

      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch (_) { }
          recognitionRef.current = null;
        }

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        let sessionFinalChunk = '';

        recognition.onstart = () => {
          if (isComponentMounted) {
            setIsListening(true);
          }
        };

        recognition.onresult = (event: any) => {
          if (!isComponentMounted) return;
          let currentFinal = '';
          let currentInterim = '';

          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              currentFinal += res[0].transcript + ' ';
            } else {
              currentInterim += res[0].transcript;
            }
          }

          sessionFinalChunk = currentFinal;
          const combined = `${accumulatedTranscriptRef.current} ${currentFinal} ${currentInterim}`
            .replace(/\s+/g, ' ')
            .trim();

          if (combined) {
            setTranscribedText(combined);
          }
        };

        recognition.onerror = (err: any) => {
          if (err.error !== 'no-speech' && err.error !== 'aborted') {
            console.warn('Speech error:', err);
          }
        };

        recognition.onend = () => {
          if (sessionFinalChunk) {
            accumulatedTranscriptRef.current = `${accumulatedTranscriptRef.current} ${sessionFinalChunk}`
              .replace(/\s+/g, ' ')
              .trim();
            sessionFinalChunk = '';
          }

          if (isComponentMounted && !isPaused) {
            if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
            restartTimeoutRef.current = setTimeout(() => {
              if (isComponentMounted && !isPaused) {
                initSession();
              }
            }, 120);
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (e) {
        console.warn('Voice session start error:', e);
        if (isComponentMounted && !isPaused) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isComponentMounted && !isPaused) initSession();
          }, 250);
        } else {
          setIsListening(false);
        }
      }
    };

    initSession();

    return () => {
      isComponentMounted = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      try {
        recognitionRef.current?.abort();
      } catch { }
      recognitionRef.current = null;
    };
  }, [isPaused]);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleManualMicPress = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.info('Listening to your microphone...');
        return;
      } catch { }
    }

    toast.error('Voice input is not supported in this browser. Please type your question.');
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[#07080e] p-6 text-white select-none animate-fade-in">
      {/* Bottom Deep Crimson/Magenta Atmospheric Glow */}
      <div className="absolute -bottom-20 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-t from-rose-600/40 via-fuchsia-600/30 to-transparent blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="flex h-12 items-center justify-between">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span>Live Voice Session</span>
        </span>

        <button
          onClick={() => toast.info('Voice session settings')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Center Waveform & Timer */}
      <div className="my-auto flex flex-col items-center justify-center text-center">
        {/* Luminous Ribbon Waveform */}
        <PhoneOrb type="ribbon-waveform" />

        {/* Live Timer counting up from 00:00 */}
        <div className="mt-4 font-mono text-3xl font-light tracking-wider text-white">
          {formatTimer(seconds)}
        </div>

        {/* Real-time Transcribed Speech */}
        <p className="mt-4 max-w-xs text-xs text-zinc-300 italic px-4">
          "{transcribedText}"
        </p>
      </div>

      {/* Bottom Controls Area */}
      <div className="relative z-10 flex items-center justify-between px-6 pb-6">
        {/* Pause / Resume Button */}
        <button
          onClick={() => {
            setIsPaused(!isPaused);
            toast.info(isPaused ? 'Voice session resumed' : 'Voice session paused');
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
          title={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
        </button>

        {/* Central Luminous Microphone Button with Radiating Ripples */}
        <div className="relative flex items-center justify-center">
          {/* Sound Ripples */}
          <span className="absolute h-20 w-20 rounded-full border border-rose-500/30 animate-ping" />
          <span className="absolute h-24 w-24 rounded-full border border-fuchsia-500/20" />

          <button
            onClick={handleManualMicPress}
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-indigo-500 text-white shadow-2xl shadow-rose-500/50 transition-transform active:scale-90"
            title="Tap to speak"
          >
            <Mic className="h-6 w-6" />
          </button>
        </div>

        {/* Cancel / End Button */}
        <button
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
          title="End session"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
