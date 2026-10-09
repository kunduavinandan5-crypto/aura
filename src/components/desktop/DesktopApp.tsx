import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Check,
  Copy,
  Image as ImageIcon,
  Menu,
  MessageSquare,
  Mic,
  Plus,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { PhoneOrb } from '@/phone/PhoneOrb';
import { SettingsModal } from '../settings/SettingsModal';
import { CameraCaptureModal } from '../camera/CameraCaptureModal';
import { UserProfile } from '@/types';
import { useChat } from '@/hooks/useChat';
import { SubjectSelect } from '../SubjectSelect';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

interface DesktopAppProps {
  user: UserProfile;
  onSignOut: () => void;
  onUpdateUser: (u: UserProfile) => void;
}

/* ── Inline waveform bars (desktop) ── */
const VoiceWaveform: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const bars = [3, 5, 9, 14, 10, 7, 13, 9, 6, 10, 14, 8, 5, 9, 13, 7, 4, 8, 12, 6];
  return (
    <div className="flex items-center gap-[3px] h-7">
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full bg-zinc-400"
          style={{
            width: 3,
            height: isActive ? `${h}px` : '3px',
            transition: `height ${0.25 + i * 0.02}s ease-in-out, opacity 0.3s`,
            animation: isActive
              ? `waveFloat ${0.55 + (i % 5) * 0.1}s ease-in-out infinite alternate`
              : 'none',
            animationDelay: `${i * 0.04}s`,
            opacity: isActive ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
};

export const DesktopApp: React.FC<DesktopAppProps> = ({ user, onSignOut, onUpdateUser }) => {
  const {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    messages,
    isGenerating,
    subjectId,
    setSubjectId,
    sendMessage,
    clearAllChats,
    reloadFromStorage,
  } = useChat(user);

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ── Inline voice state ── */
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  /* ── Modals ── */
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isGenerating]);

  /* ── Paste image support ── */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setAttachedImage(event.target.result as string);
                toast.success('Photo pasted from clipboard');
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  /* ── GSAP chat bubble entrance ── */
  useGSAP(
    () => {
      if (!messagesContainerRef.current) return;
      const bubbles = messagesContainerRef.current.querySelectorAll('.desktop-chat-bubble');
      if (bubbles.length > 0) {
        const latest = bubbles[bubbles.length - 1];
        gsap.fromTo(
          latest,
          { opacity: 0, y: 14, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out' }
        );
      }
    },
    { dependencies: [messages.length], scope: messagesContainerRef }
  );

  /* ── Voice helpers ── */
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
        const t = Array.from(e.results as SpeechRecognitionResultList)
          .map((r) => r[0].transcript)
          .join('');
        setVoiceTranscript(t);
        if (e.results[e.results.length - 1].isFinal) setIsListening(false);
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
    handleSendMessage(voiceTranscript.trim());
    stopVoice();
  }, [voiceTranscript, stopVoice]);

  /* ── Photo handling ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
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
    // Reset file input
    e.target.value = '';
  };

  const handleCapturePhoto = (imageDataUrl: string) => {
    setAttachedImage(imageDataUrl);
    toast.success('Photo captured');
  };

  /* ── Core message handler ── */
  const handleSendMessage = (text?: string) => {
    const msgText = (text !== undefined ? text : input).trim();
    const image = attachedImage || undefined;
    if ((!msgText && !image) || isGenerating) return;
    if (!subjectId) {
      toast.error('Please select a subject before asking a question.');
      return;
    }

    setInput('');
    setAttachedImage(null);
    void sendMessage(msgText, image).then((reply) => {
      if (reply && !isMuted && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance(reply.replace(/[`#*_$\-\[\]()]/g, '').slice(0, 200))
        );
      }
    });
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(
        new SpeechSynthesisUtterance(text.replace(/[`#*_$\-\[\]()]/g, ''))
      );
      toast.info('Speaking...');
    }
  };

  const isCenteredStart = messages.length === 0 && !isVoiceActive;

  const composer = (
          <div className="mx-auto max-w-3xl space-y-2">
            {/* Image Preview Chip if attached */}
            {attachedImage && !isVoiceActive && (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-950/25 p-2 px-3 w-fit anim-fade-up">
                <img
                  src={attachedImage}
                  alt="Attached preview"
                  className="h-12 w-12 rounded-lg object-cover border border-white/20 shadow-md"
                />
                <div className="text-xs">
                  <p className="font-semibold text-white">Photo Attached</p>
                  <p className="text-[10px] text-blue-300">Ready to analyze</p>
                </div>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors ml-2"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {isVoiceActive ? (
              /* Gemini-style inline voice bar */
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
                  title="Stop"
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
                >
                  <Send className="h-4 w-4 fill-current ml-0.5" />
                </button>
              </div>
            ) : (
              /* Normal input with Upload Photo + Capture Photo */
              <div className="flex items-center gap-2 rounded-full border border-white/12 bg-[#1a1c28]/95 p-2 pl-3 shadow-2xl focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
                {/* Capture Photo from Camera */}
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-cyan-400 transition-colors"
                  title="Capture Photo with Camera"
                  aria-label="Capture photo with camera"
                >
                  <Camera className="h-4 w-4" />
                </button>

                {/* Upload Photo from file */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-blue-400 transition-colors"
                  title="Upload Photo / Image"
                  aria-label="Upload photo"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>

                <SubjectSelect value={subjectId} onChange={setSubjectId} disabled={isGenerating} />

                <input
                  ref={textareaRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Ask Aura a question"
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSendMessage(input)}
                  placeholder="Ask a question, upload/capture a photo, or use voice..."
                  className="w-full bg-transparent text-sm text-white placeholder-[#5a6275] focus:outline-none"
                />

                <button
                  onClick={
                    input.trim() || attachedImage ? () => handleSendMessage(input) : startVoice
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-500/30 transition-transform active:scale-95 hover:brightness-105"
                  title={input.trim() || attachedImage ? 'Send' : 'Voice mode'}
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
    <div className="flex h-full w-full overflow-hidden bg-[#07080e] text-white select-none relative">
      {/* Hidden file input for uploading photos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Ambient background glow */}
      <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[140px] pointer-events-none" />

      {/* ── Sidebar ── */}
      <aside
        className={`flex h-full flex-col justify-between border-r border-white/[0.06] bg-[#0b0d16]/95 backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-20 ${
          isSidebarOpen ? 'w-64 p-4' : 'w-0 overflow-hidden border-none p-0'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => setActiveThreadId(null)}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 transition-transform group-hover:scale-105">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-base font-bold tracking-tight text-white font-display">
                Aura AI
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setActiveThreadId(null)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> <span>New Conversation</span>
          </button>

          <div className="space-y-1.5 pt-2 flex-1 min-h-0 flex flex-col">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              RECENT CHATS
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {threads.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-zinc-600">
                  No conversations yet
                </div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveThreadId(t.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-all ${
                      activeThreadId === t.id
                        ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-white/[0.06] pt-3 space-y-1">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-all"
          >
            <Settings className="h-4 w-4" />
            <span>Settings & Profile</span>
          </button>
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-500">
            <span className="truncate font-medium text-zinc-400">{user.name}</span>
            <button onClick={onSignOut} className="text-red-400 hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Canvas ── */}
      <main className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#07080e] relative z-10">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400">
                {activeThread?.title || 'New Conversation'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                toast.info(isMuted ? 'Audio enabled' : 'Audio muted');
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              title={isMuted ? 'Unmute voice answers' : 'Mute voice answers'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ── Chat Messages or Voice View ── */}
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-6">
          {isVoiceActive ? (
            /* Gemini-style inline listening state on Desktop */
            <div className="flex h-full flex-col items-center justify-center text-center anim-fade-in">
              <div className="absolute inset-0 bg-gradient-to-t from-blue-900/15 via-transparent to-transparent pointer-events-none" />

              <div
                className="transition-all duration-500 ease-out"
                style={{ transform: isListening ? 'scale(1.15)' : 'scale(1)' }}
              >
                <PhoneOrb type="fluid-wave" size="hero" isListening={isListening} />
              </div>

              <div className="mt-8 space-y-2 px-6 anim-fade-up">
                {voiceTranscript ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                      Recognized Question
                    </p>
                    <p className="text-2xl font-bold text-white max-w-xl mx-auto leading-relaxed">
                      "{voiceTranscript}"
                    </p>
                  </>
                ) : isListening ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                      Listening...
                    </p>
                    <p className="text-2xl font-bold text-white">
                      Hi {user.name.split(' ')[0]}, speak your question
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Voice Mode
                    </p>
                    <p className="text-2xl font-bold text-white">
                      Hi {user.name.split(' ')[0]}, what would you like to ask?
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Empty state with fluid orb and question suggestions */
            <div className="flex min-h-full flex-col items-center justify-center text-center max-w-3xl mx-auto">
              <div className="anim-float mb-4">
                <PhoneOrb type="fluid-wave" size="hero" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white font-display">
                How can I help you study today?
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Ask any question, upload or capture a photo of a problem, or use voice.
              </p>

              {/* Input bar sits in the middle of the start screen */}
              <div className="mt-8 w-full text-left">{composer}</div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {[
                  {
                    title: 'Explain key concepts',
                    query: 'Explain the most important concepts of this subject with simple examples.',
                  },
                  {
                    title: 'Exam Practice Quiz',
                    query: 'Give me 3 practice multiple-choice questions for exam revision.',
                  },
                  {
                    title: 'Numerical / Problem Help',
                    query: 'Walk me step by step through solving a typical exam numerical.',
                  },
                  {
                    title: 'Quick Revision Notes',
                    query: 'Summarize the top points I should remember for my exam.',
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.query)}
                    className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] text-left hover:bg-white/[0.08] hover:border-blue-500/40 transition-all duration-300 active:scale-95 group"
                  >
                    <p className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{item.query}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat stream */
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`desktop-chat-bubble flex gap-3.5 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-5 py-4 text-sm leading-relaxed max-w-[85%] ${
                        isUser
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white shadow-lg shadow-blue-600/20'
                          : 'border border-white/10 bg-[#121420]/95 text-zinc-200 shadow-xl backdrop-blur-md'
                      }`}
                    >
                      {/* Uploaded / Captured Image in User Message */}
                      {m.imageUrl && (
                        <div className="mb-3 overflow-hidden rounded-xl border border-white/15 bg-black/40">
                          <img
                            src={m.imageUrl}
                            alt="Uploaded question"
                            className="max-h-72 w-auto max-w-full rounded-xl object-contain cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(m.imageUrl, '_blank')}
                          />
                        </div>
                      )}

                      <div className="prose-chat break-words text-sm">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>

                      {m.suggestedFollowups && m.suggestedFollowups.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">
                            Suggested Follow-ups
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {m.suggestedFollowups.map((f, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSendMessage(f)}
                                className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/20 transition-all active:scale-95"
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isUser && (
                        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 border-t border-white/5 pt-2.5">
                          <button
                            onClick={() => copyText(m.content, m.id)}
                            className="flex items-center gap-1.5 hover:text-white transition-colors"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400 font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => speakText(m.content)}
                            className="flex items-center gap-1.5 hover:text-white transition-colors"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                            <span>Listen</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isGenerating && (
                <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 w-fit backdrop-blur-md anim-fade-up">
                  <span className="text-[11px] text-zinc-400">Aura is thinking</span>
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

        {/* ── Bottom Input / Voice Bar (hidden on the empty start screen, where the bar is centered) ── */}
        {!isCenteredStart && (
          <div className="border-t border-white/[0.06] bg-[#07080e]/90 p-4 sm:px-12 backdrop-blur-2xl shrink-0">
            {composer}
          </div>
        )}
      </main>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapturePhoto}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onDeleteAllChats={clearAllChats}
        onSyncSupabase={reloadFromStorage}
      />
    </div>
  );
};
