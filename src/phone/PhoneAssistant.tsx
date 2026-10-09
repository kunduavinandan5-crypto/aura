import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Menu,
  Mic,
  Plus,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { PhoneOrb } from './PhoneOrb';
import { SubjectSelect } from '../components/SubjectSelect';
import { CameraCaptureModal } from '../components/camera/CameraCaptureModal';
import { Message, UserProfile } from '@/types';
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

  /* ── Inline voice state ── */
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  /* ─── Start inline speech recognition ─── */
  const startVoice = useCallback(() => {
    setIsVoiceActive(true);
    setVoiceTranscript('');

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input is not supported in this browser. Please type your question.');
      setIsVoiceActive(false);
      return;
    }

    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results as SpeechRecognitionResultList)
          .map((r) => r[0].transcript)
          .join('');
        setVoiceTranscript(transcript);
        if (e.results[e.results.length - 1].isFinal) {
          setIsListening(false);
        }
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setIsListening(false);
    }
  }, []);

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);
    setIsVoiceActive(false);
    setVoiceTranscript('');
  }, []);

  const sendVoice = useCallback(() => {
    if (!voiceTranscript.trim()) return;
    onSendMessage(voiceTranscript.trim());
    stopVoice();
  }, [voiceTranscript, onSendMessage, stopVoice]);

  const handleSend = () => {
    if ((!input.trim() && !attachedImage) || isGenerating) return;
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

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#07080e] text-white select-none"
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Top Header ── */}
      <header className="flex h-16 w-full shrink-0 items-center justify-between px-5 pt-2 z-10">
        <button
          onClick={onOpenDrawer}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md">
          <span className="text-xs font-bold text-white">Aura</span>
          <span className="text-[10px] text-zinc-400">· AI Assistant</span>
        </div>

        <button
          onClick={() => {
            setIsMuted(!isMuted);
            toast.info(isMuted ? 'Audio on' : 'Audio muted');
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-md transition-all active:scale-95"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </header>

      {/* ── Center Content ── */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 z-10">
        {/* VOICE ACTIVE STATE: inline Gemini listening view */}
        {isVoiceActive ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-6 anim-fade-in">
            <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 via-transparent to-transparent pointer-events-none" />

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
          /* ── Empty state ── */
          <div className="flex h-full flex-col items-center justify-center text-center py-6">
            <div className="my-auto flex flex-col items-center">
              <div className="anim-float">
                <PhoneOrb type="fluid-wave" size="hero" />
              </div>

              <div className="mt-7 space-y-1 anim-fade-up anim-delay-200">
                <p className="text-xs font-medium text-blue-300">Hi, I'm Aura</p>
                <h2 className="text-2xl font-bold tracking-tight text-white font-display">
                  How can I help
                  <br />
                  you today?
                </h2>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xs anim-fade-up anim-delay-300">
                {[
                  'Explain key concepts',
                  'Solve math from photo',
                  'Quiz me for exam',
                  'Step-by-step calculus',
                ].map((text, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(text)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.09] hover:border-blue-500/30 transition-all active:scale-95"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Chat stream ── */
          <div className="space-y-4 py-4 max-w-lg mx-auto">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`phone-chat-bubble flex gap-2.5 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed max-w-[85%] ${
                      isUser
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white shadow-md shadow-blue-600/20'
                        : 'border border-white/10 bg-[#141622]/95 text-zinc-200 shadow-lg'
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

      {/* ── Bottom Input Bar ── */}
      <div className="shrink-0 p-4 pb-6 z-10">
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

        {!isVoiceActive && (
          <div className="mb-2 flex">
            <SubjectSelect value={subjectId} onChange={onSubjectChange} disabled={isGenerating} />
          </div>
        )}

        {isVoiceActive ? (
          /* ═══ GEMINI-STYLE INLINE VOICE BAR ═══ */
          <div className="flex items-center gap-3 rounded-full border border-white/12 bg-[#1a1c28]/95 px-4 py-3 shadow-2xl backdrop-blur-xl anim-fade-up">
            <button
              onClick={stopVoice}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-white transition-colors"
              title="Cancel"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>

            <div className="flex-1 flex items-center justify-center">
              <VoiceWaveform isActive={isListening} />
            </div>

            <button
              onClick={voiceTranscript ? sendVoice : stopVoice}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all active:scale-90 hover:bg-white/15"
              title={voiceTranscript ? 'Stop' : 'Cancel'}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>

            <button
              onClick={voiceTranscript ? sendVoice : startVoice}
              disabled={!voiceTranscript && isListening}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-all active:scale-95 ${
                voiceTranscript
                  ? 'bg-blue-500 shadow-blue-500/40 hover:brightness-110'
                  : 'bg-blue-600/50 shadow-blue-600/20 cursor-default'
              }`}
              title="Send"
            >
              <Send className="h-4 w-4 fill-current ml-0.5" />
            </button>
          </div>
        ) : (
          /* ═══ NORMAL TEXT INPUT BAR WITH PHOTO UPLOAD & CAPTURE ═══ */
          <div className="flex items-center gap-2 rounded-full border border-white/12 bg-[#1a1c28]/95 p-1.5 pl-3 shadow-2xl backdrop-blur-xl focus-within:border-blue-500/40 transition-all">
            {/* Upload Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-blue-400 transition-colors"
              title="Upload photo"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            {/* Capture Photo Button */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-cyan-400 transition-colors"
              title="Capture photo"
            >
              <Camera className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question or snap a photo..."
              className="w-full bg-transparent text-xs text-white placeholder-[#5a6275] focus:outline-none"
            />

            {/* Mic / Send toggle */}
            <button
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

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapturePhoto}
      />
    </div>
  );
};
