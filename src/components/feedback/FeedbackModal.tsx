import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, MessageSquareHeart, ThumbsDown, X } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { reason: string; comment: string }) => void;
  messageSnippet?: string;
}

const FEEDBACK_REASONS = [
  'Inaccurate information',
  "Didn't answer my question",
  'Too complicated / unclear',
  'Incomplete explanation',
  'Irrelevant examples',
  'Other',
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  messageSnippet,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason('');
      setComment('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    onSubmit({
      reason: selectedReason || 'Unspecified',
      comment: comment.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fade-in">
      {/* Dark backdrop blur */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#101322]/95 p-6 shadow-2xl backdrop-blur-2xl transition-all sm:p-7 z-10 anim-fade-up">
        {/* Glow accent */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-36 w-72 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
              <ThumbsDown className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">Feedback</h3>
              <p className="text-[11px] text-zinc-400">What went wrong with this response?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message snippet preview if available */}
        {messageSnippet && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
              Response Preview
            </span>
            <p className="line-clamp-2 italic text-zinc-300">"{messageSnippet}"</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Reason Selection Chips */}
          <div>
            <label className="text-[11px] font-medium text-zinc-300 mb-2 block">
              Select reason (optional):
            </label>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(isSelected ? '' : reason)}
                    className={`rounded-full px-3 py-1 text-xs transition-all active:scale-95 ${
                      isSelected
                        ? 'border border-rose-500/50 bg-rose-500/20 text-rose-200 font-medium shadow-sm shadow-rose-500/20'
                        : 'border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment / Details Textarea */}
          <div>
            <label className="text-[11px] font-medium text-zinc-300 mb-1.5 block">
              Provide more details (optional):
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what could be improved or what you expected..."
              rows={3}
              maxLength={1000}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white placeholder-zinc-500 focus:border-rose-500/50 focus:bg-white/[0.07] focus:outline-none transition-all resize-none"
            />
            <div className="mt-1 flex justify-end text-[10px] text-zinc-500">
              {comment.length}/1000
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-500/25 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Feedback'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
