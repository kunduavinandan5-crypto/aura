import React, { useEffect } from 'react';
import {
  BookOpen,
  GraduationCap,
  Mail,
  MessageSquareX,
  Settings,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { UserProfile } from '@/types';
import { toast } from 'sonner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  onDeleteAllChats: () => void;
  onSyncSupabase?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onDeleteAllChats,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDeleteChats = () => {
    if (
      window.confirm(
        'Are you sure you want to delete all stored chats, message logs, and search records from this device?'
      )
    ) {
      onDeleteAllChats();
      toast.success('All conversation history and search data removed');
      onClose();
    }
  };

  const displayName = user?.name || 'Scholar';
  const displayEmail = user?.email || '—';
  const displayClass = user?.studentClass || '—';
  const displaySubject = user?.subject || '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in select-none"
    >
      <div className="relative flex w-full max-w-lg max-h-[92vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0f111a] shadow-2xl">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Settings className="h-4 w-4" />
            </div>
            <h2 id="settings-title" className="text-base font-bold text-white font-display">
              Student Profile & Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-2 text-[#757f95] hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Read-only Student Profile Details */}
          <div className="rounded-2xl border border-purple-500/20 bg-purple-950/10 p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
              <User className="h-4 w-4 text-purple-400" />
              <span>Student Profile</span>
            </div>

            {/* Profile Avatar & Name */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-fuchsia-500 via-purple-600 to-indigo-600 text-base font-bold text-white shadow-md shadow-purple-500/20 ring-1 ring-white/20">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-zinc-400">Full Name</label>
                <input
                  type="text"
                  readOnly
                  value={displayName}
                  className="mt-1 w-full cursor-default select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Mail className="h-3 w-3 text-purple-400" />
                <span>Email Address</span>
              </label>
              <input
                type="text"
                readOnly
                value={displayEmail}
                className="mt-1 w-full cursor-default select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white focus:outline-none"
              />
            </div>

            {/* Class & Subject */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                  <GraduationCap className="h-3 w-3 text-purple-400" />
                  <span>Class / Grade</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={displayClass}
                  className="mt-1 w-full cursor-default select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                  <BookOpen className="h-3 w-3 text-purple-400" />
                  <span>Subject / Stream</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={displaySubject}
                  className="mt-1 w-full cursor-default select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Clear Chat History & Data */}
          <div className="rounded-2xl border border-red-500/20 bg-red-950/15 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
              <MessageSquareX className="h-4 w-4 text-red-400" />
              <span>Clear Chat History & Data</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Permanently deletes all chat conversations and search records from this device.
            </p>

            <button
              type="button"
              onClick={handleDeleteChats}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Chat History</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-white/10 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 active:scale-95 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
