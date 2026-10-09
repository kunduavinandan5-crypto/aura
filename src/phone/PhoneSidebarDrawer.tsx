import React from 'react';
import {
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Thread, UserProfile } from '@/types';

interface PhoneSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export const PhoneSidebarDrawer: React.FC<PhoneSidebarDrawerProps> = ({
  isOpen,
  onClose,
  user,
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onOpenSettings,
  onSignOut,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative flex h-full w-[80%] max-w-[300px] flex-col justify-between border-r border-white/10 bg-[#0d0f17] p-5 shadow-2xl">
        {/* Top Section */}
        <div className="space-y-4">
          {/* Header with User Info */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-500 to-indigo-600 text-xs font-bold text-white shadow-md">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="truncate text-left leading-tight">
                <div className="truncate text-xs font-bold text-white">{user.name}</div>
                <div className="text-[10px] text-zinc-400">{user.isGuest ? 'Guest' : user.email}</div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/20 active:scale-95"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              <span>New Conversation</span>
            </div>
            <Sparkles className="h-3.5 w-3.5 text-amber-200" />
          </button>

          {/* Chat History */}
          <div className="space-y-1 pt-2">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Recent Chats
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-none pr-1">
              {threads.length === 0 ? (
                <div className="px-2 py-4 text-center text-[11px] text-zinc-600">
                  No previous chats
                </div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelectThread(t.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs truncate transition-colors ${
                      activeThreadId === t.id
                        ? 'bg-purple-600/20 text-purple-300 font-medium'
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

        {/* Bottom Section */}
        <div className="space-y-1.5 border-t border-white/10 pt-3">
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            <span>Settings & Profile</span>
          </button>

          <button
            onClick={() => {
              onSignOut();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            <span>Switch Account</span>
          </button>
        </div>
      </div>

      {/* Backdrop click area */}
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
