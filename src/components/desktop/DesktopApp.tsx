import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  Camera,
  Check,
  Copy,
  Image as ImageIcon,
  LogOut,
  MessageSquare,
  Mic,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
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

/* ── Inline waveform bars (voice input) ── */
const VoiceWaveform: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const bars = [3, 5, 9, 14, 10, 7, 13, 9, 6, 10, 14, 8, 5, 9, 13, 7, 4, 8, 12, 6];
  return (
    <div className="flex h-7 items-center gap-[3px]">
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full bg-[#a8c7fa]"
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

const iconBtn =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#c4c7c5] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40';

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
    startNewChat,
    clearAllChats,
    reloadFromStorage,
  } = useChat(user);

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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


  const firstName = user.name.trim().split(/\s+/)[0] || 'there';
  const hasInput = Boolean(input.trim() || attachedImage);
  const visibleThreads = threads.filter((t) => t.title.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const isEmpty = messages.length === 0 && !isVoiceActive;

  /* ── Composer (shared by the centered empty state and the bottom bar) ── */
  const composer = (
    <div className="mx-auto w-full max-w-3xl space-y-2">
      {attachedImage && !isVoiceActive && (
        <div className="flex w-fit items-center gap-3 rounded-2xl bg-[#1e1f20] p-2 pr-3">
          <img src={attachedImage} alt="Attached preview" className="h-12 w-12 rounded-xl object-cover" />
          <span className="text-xs text-[#c4c7c5]">Photo attached</span>
          <button onClick={() => setAttachedImage(null)} className={iconBtn} aria-label="Remove photo">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isVoiceActive ? (
        <div className="flex items-center gap-2 rounded-full bg-[#1e1f20] px-3 py-2.5">
          <button onClick={stopVoice} className={iconBtn} aria-label="Cancel voice input">
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            {voiceTranscript ? (
              <p className="truncate text-sm text-[#e3e3e3]">{voiceTranscript}</p>
            ) : (
              <VoiceWaveform isActive={isListening} />
            )}
          </div>
          {voiceTranscript ? (
            <button
              onClick={sendVoice}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-[#131314] transition-transform hover:bg-white active:scale-95"
              aria-label="Send question"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={isListening ? stopVoice : startVoice}
              className={iconBtn}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-full bg-[#1e1f20] py-2 pr-2.5 pl-3 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(168,199,250,0.45)]">
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className={iconBtn}
            title="Capture photo with camera"
            aria-label="Capture photo with camera"
          >
            <Camera className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={iconBtn}
            title="Upload photo"
            aria-label="Upload photo"
          >
            <ImageIcon className="h-[18px] w-[18px]" />
          </button>
          <SubjectSelect value={subjectId} onChange={setSubjectId} disabled={isGenerating} className="mx-1" />

          <input
            ref={textareaRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSendMessage(input)}
            aria-label="Ask Aura a question"
            placeholder="Ask Aura"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-[#e3e3e3] placeholder-[#9aa0a6] focus:outline-none"
          />

          {hasInput ? (
            <button
              onClick={() => handleSendMessage(input)}
              disabled={isGenerating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-[#131314] transition-transform hover:bg-white active:scale-95 disabled:opacity-50"
              aria-label="Send"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          ) : (
            <button onClick={startVoice} className={iconBtn} title="Voice input" aria-label="Voice input">
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#131314] text-[#e3e3e3]">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* ── Sidebar ── */}
      <aside
        className={`z-20 flex h-full shrink-0 flex-col bg-[#1b1c1d] transition-[width] duration-300 ease-out ${
          isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
        }`}
        aria-label="Conversations"
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4">
          <button onClick={startNewChat} className="flex items-center gap-2.5" aria-label="Aura home">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570]">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="text-lg font-medium text-white">Aura</span>
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className={iconBtn} aria-label="Collapse sidebar">
            <PanelLeft className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 px-3">
          <button
            onClick={startNewChat}
            className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm transition-colors ${
              activeThreadId === null ? 'bg-[#282a2c] text-white' : 'text-[#c4c7c5] hover:bg-white/5'
            }`}
          >
            <SquarePen className="h-[18px] w-[18px]" />
            <span>New chat</span>
          </button>
          <button
            onClick={() => {
              setIsSearchOpen((v) => !v);
              setSearchQuery('');
            }}
            className="flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm text-[#c4c7c5] transition-colors hover:bg-white/5"
          >
            <Search className="h-[18px] w-[18px]" />
            <span>Search chats</span>
          </button>
          {isSearchOpen && (
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your chats"
              aria-label="Search chats"
              className="w-full rounded-full bg-[#282a2c] px-4 py-2 text-sm text-white placeholder-[#9aa0a6] focus:outline-none"
            />
          )}
        </nav>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div className="px-3.5 pb-2 text-sm font-medium text-[#c4c7c5]">Recent</div>
          {visibleThreads.length === 0 ? (
            <p className="px-3.5 py-2 text-sm text-[#80868b]">
              {threads.length === 0 ? 'No conversations yet' : 'No matching chats'}
            </p>
          ) : (
            visibleThreads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2 text-left text-sm transition-colors ${
                  activeThreadId === t.id ? 'bg-[#282a2c] text-white' : 'text-[#e3e3e3] hover:bg-white/5'
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-[#80868b]" />
                <span className="truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-white/5 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3c4043] text-sm font-medium text-white">
            {firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-[#9aa0a6]">{user.isGuest ? 'Demo' : user.email}</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className={iconBtn} title="Settings" aria-label="Settings">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button onClick={onSignOut} className={iconBtn} title="Sign out" aria-label="Sign out">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_70%_55%_at_50%_45%,rgba(26,60,140,0.28),transparent_70%)]">
        <header className="flex h-16 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className={iconBtn} aria-label="Open sidebar">
                <PanelLeft className="h-5 w-5" />
              </button>
            )}
            {activeThread && <span className="truncate text-sm text-[#c4c7c5]">{activeThread.title}</span>}
          </div>
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              toast.info(isMuted ? 'Voice answers on' : 'Voice answers muted');
            }}
            className={iconBtn}
            title={isMuted ? 'Unmute voice answers' : 'Mute voice answers'}
            aria-label={isMuted ? 'Unmute voice answers' : 'Mute voice answers'}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </header>

        {isEmpty ? (
          /* Greeting with the composer centered, like a fresh chat */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
            <h1 className="mb-9 text-center text-4xl font-normal tracking-tight text-[#e3e3e3] sm:text-5xl">
              Hi {firstName}, let&rsquo;s get started
            </h1>
            <div className="w-full">{composer}</div>
            <div className="mt-6 flex max-w-3xl flex-wrap justify-center gap-2.5">
              {[
                'Explain key concepts',
                'Quiz me for my exam',
                'Walk me through a numerical',
                'Quick revision notes',
              ].map((text) => (
                <button
                  key={text}
                  onClick={() => handleSendMessage(text)}
                  className="rounded-full bg-[#1e1f20] px-4 py-2 text-sm text-[#c4c7c5] transition-colors hover:bg-[#282a2c] hover:text-white"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {isVoiceActive && messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-2xl text-[#c4c7c5]">
                  {voiceTranscript || (isListening ? 'Listening…' : 'Tap the mic and ask your question')}
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-8 pb-6">
                  {messages
                    .filter((m) => m.role === 'user' || m.content)
                    .map((m) => {
                    const isUser = m.role === 'user';
                    return (
                      <div key={m.id} className="desktop-chat-bubble">
                        {isUser ? (
                          <div className="flex justify-end">
                            <div className="max-w-[80%] rounded-3xl bg-[#282a2c] px-5 py-3 text-base leading-relaxed">
                              {m.imageUrl && (
                                <img
                                  src={m.imageUrl}
                                  alt="Uploaded question"
                                  className="mb-2 max-h-64 w-auto max-w-full rounded-2xl object-contain"
                                />
                              )}
                              <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570]">
                              <Sparkles className="h-4 w-4 text-white" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="prose-chat break-words text-base leading-relaxed text-[#e3e3e3]">
                                <ReactMarkdown>{m.content}</ReactMarkdown>
                              </div>

                              {m.content && (
                                <div className="mt-2 flex items-center gap-1">
                                  <button
                                    onClick={() => copyText(m.content, m.id)}
                                    className={iconBtn}
                                    title="Copy"
                                    aria-label="Copy answer"
                                  >
                                    {copiedId === m.id ? (
                                      <Check className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => speakText(m.content)}
                                    className={iconBtn}
                                    title="Listen"
                                    aria-label="Read answer aloud"
                                  >
                                    <Volume2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}

                              {m.suggestedFollowups && m.suggestedFollowups.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {m.suggestedFollowups.map((f) => (
                                    <button
                                      key={f}
                                      onClick={() => handleSendMessage(f)}
                                      className="rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-[#c4c7c5] transition-colors hover:bg-white/5 hover:text-white"
                                    >
                                      {f}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isGenerating && (
                    <div className="flex items-center gap-4" role="status" aria-label="Aura is thinking">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570]">
                        <Sparkles className="h-4 w-4 animate-pulse text-white" />
                      </span>
                      <span className="flex items-center gap-1 text-[#a8c7fa]">
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
            <div className="shrink-0 px-6 pt-2 pb-6">
              {composer}
              <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-[#80868b]">
                Aura can make mistakes. Check important answers against your textbook.
              </p>
            </div>
          </>
        )}
      </main>

      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapturePhoto}
      />

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

