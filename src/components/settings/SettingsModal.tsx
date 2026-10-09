import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Check,
  Cloud,
  Database,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquareX,
  RefreshCw,
  Save,
  Server,
  Settings,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { UserProfile } from '@/types';
import { storage } from '@/lib/storage';
import { testSupabaseConnection, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
  onDeleteAllChats: () => void;
  onSyncSupabase?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onDeleteAllChats,
  onSyncSupabase,
}) => {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [studentClass, setStudentClass] = useState(user?.studentClass || '');
  const [subject, setSubject] = useState(user?.subject || '');
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(user?.name || '');
      setEmail(user?.email || '');
      setStudentClass(user?.studentClass || '');
      setSubject(user?.subject || '');
      setSupabaseStatus(null);
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseStatus(null);
    try {
      const result = await testSupabaseConnection();
      setSupabaseStatus(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      setSupabaseStatus({ success: false, message: e.message || 'Connection failed' });
      toast.error('Supabase connection failed');
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handlePullSync = async () => {
    setIsSyncing(true);
    try {
      if (!isSupabaseConfigured) {
        toast.info('Cloud sync is not configured for this deployment.');
        return;
      }
      const result = await storage.syncFromSupabase(user.id);
      toast.success(`Synced ${result.threads} chats from the cloud`);
      if (onSyncSupabase) onSyncSupabase();
    } catch (e) {
      toast.error('Failed to sync from cloud');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Profile name cannot be empty');
      return;
    }

    const updated: UserProfile = {
      ...user,
      name: name.trim(),
      email: email.trim(),
      studentClass: studentClass.trim(),
      subject: subject.trim(),
    };
    onUpdateUser(updated);

    toast.success('Profile saved and synced successfully!');
    onClose();
  };

  const handleDeleteChats = () => {
    if (
      window.confirm(
        'Are you sure you want to delete all stored chats, message logs, and search records?'
      )
    ) {
      onDeleteAllChats();
      toast.success('All conversation history and search data removed');
      onClose();
    }
  };

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
            <h2 id="settings-title" className="text-base font-bold text-white font-display">Student Profile & Settings</h2>
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
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: User Profile Details (Name, Email, Class & Subject) */}
          <div className="rounded-2xl border border-purple-500/20 bg-purple-950/10 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
              <User className="h-4 w-4 text-purple-400" />
              <span>Student Profile</span>
            </div>

            {/* Profile Avatar & Name */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-fuchsia-500 via-purple-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-purple-500/20 ring-1 ring-white/20">
                {name.trim().charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-zinc-400">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
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
                type="email"
                placeholder="e.g. alex@student.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Class & Subject */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                  <GraduationCap className="h-3 w-3 text-purple-400" />
                  <span>Class / Grade / Year</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class 12 / 3rd Year"
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                  <BookOpen className="h-3 w-3 text-purple-400" />
                  <span>Subject / Stream</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Cloud Sync (Supabase) */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <Database className="h-4 w-4 text-emerald-400" />
                <span>Cloud Sync & Database</span>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                  isSupabaseConfigured
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                }`}
              >
                {isSupabaseConfigured ? (user.isGuest ? 'Cloud (guest)' : 'Cloud sync on') : 'Local Storage Mode'}
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Synchronizes your student profile, conversation history, and learning preferences across devices.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestSupabase}
                disabled={isTestingSupabase}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all"
              >
                {isTestingSupabase ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                <span>Test Cloud Connection</span>
              </button>

              <button
                type="button"
                onClick={handlePullSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10 active:scale-95 transition-all"
              >
                {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Sync Now</span>
              </button>
            </div>

            {supabaseStatus && (
              <div
                className={`rounded-lg px-3 py-2 text-[11px] flex items-center gap-2 ${
                  supabaseStatus.success
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}
              >
                {supabaseStatus.success ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Server className="h-3.5 w-3.5 text-amber-400" />}
                <span>{supabaseStatus.message}</span>
              </div>
            )}
          </div>

          {/* Section 3: Clear Data */}
          <div className="rounded-2xl border border-red-500/20 bg-red-950/15 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
              <MessageSquareX className="h-4 w-4 text-red-400" />
              <span>Clear Chat History & Data</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Permanently deletes all chat conversations and search records from this device and from cloud sync.
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/20 hover:opacity-95 active:scale-95 transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
