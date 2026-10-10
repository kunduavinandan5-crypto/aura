import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Check,
  Copy,
  Image as ImageIcon,
  Menu,
  Mic,
  Plus,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { PhoneOrb } from './PhoneOrb';
import { SubjectSelect } from '../components/SubjectSelect';
import { CameraCaptureModal } from '../components/camera/CameraCaptureModal';
import { FeedbackModal } from '../components/feedback/FeedbackModal';
import { Velaris } from '@/components/ui/velaris';
import { LiquidButton, GlassFilter } from '@/components/ui/liquid-glass-button';
import { Message, UserProfile } from '@/types';
import { mergeTranscripts, cleanDuplicatePhrases } from '@/lib/utils';
import { submitMessageFeedback, getSavedFeedbackRatings, saveFeedbackRating } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

interface PhoneAssistantProps {
  user: UserProfile;
  messages: Message[];
  isGenerating: boolean;
  onSendMessage: (text: string, image?: string) => void;
  subjectId: string;
  onSubjectChange: (subjectId: string) => void;
  onOpenVoiceMode?: () => void;
  onOpenDrawer: () => void;
}

/* ─── Inline Gemini-style waveform bars ─── */
const VoiceWaveform: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const bars = [3, 5, 8, 12, 9, 6, 11, 8, 5, 9, 12, 7, 4, 8, 11, 6, 4];
  return (
    <div className="flex items-center gap-[3px] h-6">
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full bg-zinc-300"
          style={{
            width: 2.5,
            height: isActive ? `${h}px` : '3px',
            transition: `height ${0.3 + i * 0.03}s ease-in-out, opacity 0.3s`,
            animation: isActive
              ? `waveFloat ${0.6 + (i % 5) * 0.12}s ease-in-out infinite alternate`
              : 'none',
            animationDelay: `${i * 0.05}s`,
            opacity: isActive ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
};

export const PhoneAssistant: React.FC<PhoneAssistantProps> = ({
  user,
  messages,
  isGenerating,
  onSendMessage,
  subjectId,
  onSubjectChange,
  onOpenDrawer,
}) => {
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, 'positive' | 'negative'>>(() => getSavedFeedbackRatings());
  const [feedbackModalTarget, setFeedbackModalTarget] = useState<{ messageId: string; snippet: string } | null>(null);

  /* ── Inline voice state ── */
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const isVoiceActiveRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');
  const restartTimeoutRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      isVoiceActiveRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      try {
        recognitionRef.current?.abort();
      } catch (_) { }
    };
  }, []);

  // Auto-scroll inside the chat container only
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isGenerating]);

  // GSAP chat bubble entrance
  useGSAP(
    () => {
      if (!containerRef.current) return;
      const bubbles = containerRef.current.querySelectorAll('.phone-chat-bubble');
      if (bubbles.length > 0) {
        const latest = bubbles[bubbles.length - 1];
        gsap.fromTo(
          latest,
          { opacity: 0, y: 12, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' }
        );
      }
    },
    { dependencies: [messages.length], scope: containerRef }
  );

  /* ─── Start inline speech recognition (Continuous recording until user stops) ─── */
  const startVoice = useCallback(() => {
    setIsVoiceActive(true);
    isVoiceActiveRef.current = true;
    setVoiceTranscript('');
    accumulatedTranscriptRef.current = '';

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input is not supported in this browser. Please type your question.');
      setIsVoiceActive(false);
      isVoiceActiveRef.current = false;
      return;
    }

    const initRecognitionSession = () => {
      if (!isVoiceActiveRef.current) return;

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
          if (isVoiceActiveRef.current) {
            setIsListening(true);
          }
        };

        recognition.onresult = (e: any) => {
          if (!isVoiceActiveRef.current) return;
          let currentFinal = '';
          let currentInterim = '';

          for (let i = 0; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              currentFinal += res[0].transcript + ' ';
            } else {
              currentInterim += res[0].transcript;
            }
          }

          sessionFinalChunk = currentFinal;
          const sessionText = `${currentFinal} ${currentInterim}`.trim();
          const merged = mergeTranscripts(accumulatedTranscriptRef.current, sessionText);

          if (merged) {
            setVoiceTranscript(merged);
          }
        };

        recognition.onerror = (event: any) => {
          // 'no-speech' or 'aborted' are standard non-fatal events during pauses on mobile
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('Speech recognition notice:', event.error);
          }
        };

        recognition.onend = () => {
          if (sessionFinalChunk) {
            accumulatedTranscriptRef.current = mergeTranscripts(
              accumulatedTranscriptRef.current,
              sessionFinalChunk
            );
            sessionFinalChunk = '';
          }

          if (isVoiceActiveRef.current) {
            if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
            restartTimeoutRef.current = setTimeout(() => {
              if (isVoiceActiveRef.current) {
                initRecognitionSession();
              }
            }, 120);
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        console.warn('Speech recognition start notice:', err);
        if (isVoiceActiveRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isVoiceActiveRef.current) initRecognitionSession();
          }, 250);
        } else {
          setIsListening(false);
        }
      }
    };

    initRecognitionSession();
  }, []);

  const stopVoice = useCallback(() => {
    isVoiceActiveRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch { }
    recognitionRef.current = null;
    setIsListening(false);
    setIsVoiceActive(false);
    setVoiceTranscript('');
    accumulatedTranscriptRef.current = '';
  }, []);

  const sendVoice = useCallback(() => {
    isVoiceActiveRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch { }
    recognitionRef.current = null;
    setIsListening(false);
    setIsVoiceActive(false);

    const textToSend = cleanDuplicatePhrases(
      voiceTranscript.trim() || accumulatedTranscriptRef.current.trim()
    );
    if (textToSend) {
      onSendMessage(textToSend);
    }
    setVoiceTranscript('');
    accumulatedTranscriptRef.current = '';
  }, [voiceTranscript, onSendMessage]);

  const handleSend = () => {
    if ((!input.trim() && !attachedImage) || isGenerating) return;
    if (!subjectId) {
      toast.error('Please select a subject before asking a question.');
      return;
    }
    onSendMessage(input.trim(), attachedImage || undefined);
    setInput('');
    setAttachedImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAttachedImage(event.target.result as string);
        toast.success('Photo attached');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCapturePhoto = (imageDataUrl: string) => {
    setAttachedImage(imageDataUrl);
    toast.success('Photo captured');
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleMute = useCallback(() => {
    if ('speechSynthesis' in window && (window.speechSynthesis.speaking || speakingMessageId)) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      setIsMuted(true);
      toast.info('Audio muted and stopped');
      return;
    }
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    }
    toast.info(nextMuted ? 'Audio muted' : 'Audio enabled');
  }, [isMuted, speakingMessageId]);

  const speakText = useCallback((text: string, messageId?: string) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Speech synthesis not supported in this browser');
      return;
    }

    if (speakingMessageId === messageId || (window.speechSynthesis.speaking && !messageId)) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      toast.info('Stopped speaking');
      return;
    }

    window.speechSynthesis.cancel();
    setIsMuted(false);

    const cleanText = text.replace(/[`#*_$\-\[\]()]/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (messageId) {
      setSpeakingMessageId(messageId);
    }
    utterance.onend = () => {
      setSpeakingMessageId(null);
    };
    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    window.speechSynthesis.speak(utterance);
    toast.info('Speaking...');
  }, [speakingMessageId]);

  /* ── Feedback Handlers ── */
  const handleThumbsUp = useCallback(async (message: Message) => {
    if (feedbackRatings[message.id]) {
      toast.info('Feedback already recorded for this response');
      return;
    }
    setFeedbackRatings((prev) => {
      const next = { ...prev, [message.id]: 'positive' as const };
      saveFeedbackRating(message.id, 'positive');
      return next;
    });
    toast.success('Thank you for your feedback!');
    await submitMessageFeedback({
      messageId: message.id,
      userId: user.id,
      userEmail: user.email,
      rating: 'positive',
      messageSnippet: message.content.slice(0, 300),
      subjectId,
    });
  }, [feedbackRatings, user.id, user.email, subjectId]);

  const handleThumbsDownClick = useCallback((message: Message) => {
    if (feedbackRatings[message.id]) {
      toast.info('Feedback already recorded for this response');
      return;
    }
    setFeedbackModalTarget({
      messageId: message.id,
      snippet: message.content.slice(0, 200),
    });
  }, [feedbackRatings]);

  const handleFeedbackModalSubmit = useCallback(async (data: { reason: string; comment: string }) => {
    if (!feedbackModalTarget) return;
    const targetId = feedbackModalTarget.messageId;
    const targetSnippet = feedbackModalTarget.snippet;
    setFeedbackModalTarget(null);
    setFeedbackRatings((prev) => {
      const next = { ...prev, [targetId]: 'negative' as const };
      saveFeedbackRating(targetId, 'negative');
      return next;
    });
    toast.success('Feedback submitted. Thank you!');
    await submitMessageFeedback({
      messageId: targetId,
      userId: user.id,
      userEmail: user.email,
      rating: 'negative',
      reason: data.reason,
      comment: data.comment,
      messageSnippet: targetSnippet,
      subjectId,
    });
  }, [feedbackModalTarget, user.id, user.email, subjectId]);

  const isCenteredStart = messages.length === 0 && !isVoiceActive;

  const phoneComposer = (
    <div className="w-full">
      {/* Attached Photo Preview */}
      {attachedImage && !isVoiceActive && (
        <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-blue-500/30 bg-blue-950/40 p-1.5 px-3 w-fit anim-fade-up">
          <img
            src={attachedImage}
            alt="Preview"
            className="h-9 w-9 rounded-lg object-cover border border-white/20"
          />
          <span className="text-[11px] font-medium text-blue-200">Photo Attached</span>
          <button
            onClick={() => setAttachedImage(null)}
            className="rounded-full p-1 text-zinc-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isVoiceActive ? (
        /* ═══ GEMINI-STYLE INLINE VOICE BAR ═══ */
        <div className="relative flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] p-1.5 pl-3 shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all">
          <button
            onClick={stopVoice}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex-1 flex items-center justify-center px-2">
            <VoiceWaveform isActive={isListening} />
          </div>

          <button
            onClick={stopVoice}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all active:scale-90 hover:bg-white/15"
            title="Stop recording"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>

          <button
            type="button"
            onClick={voiceTranscript ? sendVoice : startVoice}
            disabled={!voiceTranscript && isListening}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-all active:scale-95 ${
              voiceTranscript
                ? 'bg-blue-500 shadow-blue-500/40 hover:brightness-110 cursor-pointer'
                : 'bg-blue-600/50 shadow-blue-600/20 cursor-default opacity-50'
            }`}
            title="Send"
          >
            <Send className="h-4 w-4 fill-current ml-0.5" />
          </button>
        </div>
      ) : (
        /* ═══ LIQUID GLASS SEARCH / QUESTION BAR ═══ */
        <div className="relative flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] p-1.5 pl-3 shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-2xl focus-within:border-white/40 transition-all">
          {/* Capture Photo Button */}
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-cyan-400 transition-colors"
            title="Capture photo"
            aria-label="Capture photo with camera"
          >
            <Camera className="h-4 w-4" />
          </button>

          {/* Upload Photo Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-blue-400 transition-colors"
            title="Upload photo"
            aria-label="Upload photo"
          >
            <ImageIcon className="h-4 w-4" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="ask your question"
            className="w-full bg-transparent text-xs text-white placeholder-zinc-400 focus:outline-none"
          />

          {/* Mic / Send button */}
          <button
            type="button"
            onClick={input.trim() || attachedImage ? handleSend : startVoice}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 via-violet-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transition-transform active:scale-95 hover:brightness-110"
            title={input.trim() || attachedImage ? 'Send' : 'Voice input'}
          >
            {input.trim() || attachedImage ? (
              <Send className="h-4 w-4 fill-current ml-0.5" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full flex-col overflow-hidden text-white select-none transition-colors duration-700 ${
        isCenteredStart
          ? 'bg-gradient-to-b from-[#221454] via-[#080d1e] to-[#04281f]'
          : 'bg-[#07080e]'
      }`}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Animated WebGL Simplex-Noise gradient backgrounds */}
      {isCenteredStart ? (
        /* Celestial Indigo-Emerald Palette on Starting / New Conversation Page */
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden transition-opacity duration-700">
          {/* Base full-face vibrant celestial gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#26155c] via-[#090e21] to-[#052e24]" />

          {/* Slight organic WebGL simplex noise animation */}
          <div className="absolute inset-0 opacity-55 mix-blend-screen">
            <Velaris
              height="100%"
              bg="#000000"
              colors={['#452094', '#1f3478', '#0e5a47', '#052920']}
              speed={0.4}
              grain={0.06}
              className="h-full w-full"
            />
          </div>

          {/* Atmospheric luminous glow highlights */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[360px] rounded-full bg-indigo-500/25 blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 h-64 w-[360px] rounded-full bg-emerald-500/20 blur-[100px] pointer-events-none" />
        </div>
      ) : messages.length > 0 && !isVoiceActive ? (
        /* Previous Blue-Indigo-Violet Palette during Active Conversation */
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-50 transition-opacity duration-700">
          <Velaris
            height="100%"
            bg="#07080e"
            colors={['#1d4ed8', '#4338ca', '#6d28d9', '#07080e']}
            speed={1.2}
            grain={0.2}
            className="h-full w-full"
          />
        </div>
      ) : null}

      {/* ── Top Header ── */}
      <header className="relative flex h-16 w-full shrink-0 items-center justify-between px-5 pt-2 z-30">
        <button
          onClick={onOpenDrawer}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>

        <SubjectSelect variant="header" value={subjectId} onChange={onSubjectChange} disabled={isGenerating} />

        <button
          onClick={toggleMute}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
          title={isMuted ? 'Unmute voice answers' : 'Mute / Stop audio'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-blue-400" />}
        </button>
      </header>

      {/* ── Center Content ── */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 z-10 relative flex flex-col">
        {/* VOICE ACTIVE STATE: inline Gemini listening view */}
        {isVoiceActive ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-6 anim-fade-in my-auto">

            {/* Gemini fluid orb */}
            <div
              className="transition-all duration-500 ease-out"
              style={{ transform: isListening ? 'scale(1.12)' : 'scale(1)' }}
            >
              <PhoneOrb type="fluid-wave" size="hero" isListening={isListening} />
            </div>

            {/* Dynamic greeting or transcript */}
            <div className="mt-8 space-y-2 px-6 anim-fade-up anim-delay-100">
              {voiceTranscript ? (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-blue-400">
                    Recognized
                  </p>
                  <p className="text-lg font-semibold text-white leading-snug max-w-xs mx-auto">
                    "{voiceTranscript}"
                  </p>
                </>
              ) : isListening ? (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-blue-400">
                    Listening...
                  </p>
                  <p className="text-xl font-semibold text-white">
                    Hi {user.name.split(' ')[0]}, speak now
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Voice Mode
                  </p>
                  <p className="text-xl font-semibold text-white">
                    Hi {user.name.split(' ')[0]}, what's the plan?
                  </p>
                </>
              )}
            </div>
          </div>
        ) : messages.length === 0 ? (
          /* ── Empty state centered without orb ── */
          <div className="flex h-full flex-col items-center justify-center text-center py-6 px-2 my-auto anim-fade-in">
            <div className="w-full max-w-sm flex flex-col items-center my-auto">
              <div className="space-y-1 mb-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Hi, I'm Aura</p>
                <h2 className="text-2xl font-bold tracking-tight text-white font-display">
                  How can I help you today?
                </h2>
                <p className="text-xs text-zinc-300/80">
                  Ask any question, upload a problem photo, or use voice.
                </p>
              </div>

              {/* Centered Search / Question Box */}
              <div className="w-full mb-6 text-left">
                {phoneComposer}
              </div>

              {/* Quick suggestion pills */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {[
                  'Explain key concepts',
                  'Quiz me for exam',
                  'Step-by-step numerical',
                  'Quick revision notes',
                ].map((text, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(text)}
                    className="rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-md px-3.5 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.12] hover:border-blue-400/40 transition-all active:scale-95 shadow-sm"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Chat stream ── */
          <div className="space-y-4 py-4 max-w-lg mx-auto w-full">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`phone-chat-bubble flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'
                    }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed max-w-[85%] ${isUser
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white shadow-md shadow-blue-600/20'
                      : 'border border-white/10 bg-[#121626]/90 text-zinc-200 shadow-lg backdrop-blur-md'
                      }`}
                  >
                    {/* Uploaded / Captured Image thumbnail */}
                    {m.imageUrl && (
                      <div className="mb-2.5 overflow-hidden rounded-xl border border-white/15 bg-black/40">
                        <img
                          src={m.imageUrl}
                          alt="Uploaded question"
                          className="max-h-56 w-auto max-w-full rounded-xl object-contain cursor-pointer"
                          onClick={() => window.open(m.imageUrl, '_blank')}
                        />
                      </div>
                    )}

                    <div className="prose-chat break-words text-xs sm:text-sm">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>

                    {m.suggestedFollowups && m.suggestedFollowups.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                        {m.suggestedFollowups.map((f, idx) => (
                          <button
                            key={idx}
                            onClick={() => onSendMessage(f)}
                            className="rounded-full bg-blue-500/10 border border-blue-500/25 px-2.5 py-0.5 text-[10px] text-blue-200 active:scale-95 transition-all"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}

                    {!isUser && (
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500 border-t border-white/5 pt-2">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => copyText(m.content, m.id)}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                            title="Copy response"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400 font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => speakText(m.content, m.id)}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                            title="Listen to response"
                          >
                            {speakingMessageId === m.id ? (
                              <>
                                <VolumeX className="h-3 w-3 text-blue-400 animate-pulse" />
                                <span className="text-blue-400 font-medium">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span>Listen</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* ── Mobile Thumbs Up / Down Feedback (One-time submission) ── */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleThumbsUp(m)}
                            disabled={Boolean(feedbackRatings[m.id])}
                            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-all ${
                              feedbackRatings[m.id] === 'positive'
                                ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 font-medium cursor-default shadow-sm'
                                : feedbackRatings[m.id] === 'negative'
                                ? 'text-zinc-600 opacity-35 cursor-not-allowed pointer-events-none'
                                : 'text-zinc-500 hover:text-emerald-300 hover:bg-white/5 active:scale-90'
                            }`}
                            title={feedbackRatings[m.id] ? 'Feedback already submitted' : 'Good response (Thumbs up)'}
                          >
                            <ThumbsUp className="h-3 w-3" />
                            {feedbackRatings[m.id] === 'positive' && (
                              <span className="text-[9px] font-medium">Helpful</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleThumbsDownClick(m)}
                            disabled={Boolean(feedbackRatings[m.id])}
                            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-all ${
                              feedbackRatings[m.id] === 'negative'
                                ? 'text-rose-400 bg-rose-500/20 border border-rose-500/30 font-medium cursor-default shadow-sm'
                                : feedbackRatings[m.id] === 'positive'
                                ? 'text-zinc-600 opacity-35 cursor-not-allowed pointer-events-none'
                                : 'text-zinc-500 hover:text-rose-300 hover:bg-white/5 active:scale-90'
                            }`}
                            title={feedbackRatings[m.id] ? 'Feedback already submitted' : 'Poor response (Thumbs down)'}
                          >
                            <ThumbsDown className="h-3 w-3" />
                            {feedbackRatings[m.id] === 'negative' && (
                              <span className="text-[9px] font-medium">Reported</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 w-fit backdrop-blur-md anim-fade-up">
                <span className="text-[10px] text-zinc-400">Thinking</span>
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="gemini-typing-dot" />
                  <span className="gemini-typing-dot" />
                  <span className="gemini-typing-dot" />
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom Input Bar (rendered only during chat stream or voice mode) ── */}
      {!isCenteredStart && (
        <div className="shrink-0 p-4 pb-6 z-10">
          {phoneComposer}
        </div>
      )}
      <GlassFilter />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={Boolean(feedbackModalTarget)}
        onClose={() => setFeedbackModalTarget(null)}
        onSubmit={handleFeedbackModalSubmit}
        messageSnippet={feedbackModalTarget?.snippet}
      />

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapturePhoto}
      />
    </div>
  );
};
