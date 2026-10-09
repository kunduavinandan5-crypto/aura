import React from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { SUBJECTS } from '@/lib/subjects';

interface SubjectSelectProps {
  /** Selected subject id, or '' when nothing is chosen yet. */
  value: string;
  onChange: (subjectId: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Native <select> (accessible and touch-friendly) styled as a compact chip. Highlights until a subject is chosen. */
export const SubjectSelect: React.FC<SubjectSelectProps> = ({ value, onChange, disabled, className = '' }) => (
  <label
    className={`relative flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-6 pl-2.5 text-[11px] font-medium focus-within:border-blue-500/60 ${
      value ? 'border-white/10 bg-white/5 text-zinc-200' : 'border-amber-400/50 bg-amber-400/10 text-amber-200'
    } ${className}`}
  >
    <BookOpen className={`h-3.5 w-3.5 ${value ? 'text-blue-300' : 'text-amber-300'}`} aria-hidden="true" />
    <span className="sr-only">Subject (required)</span>
    <select
      value={value}
      disabled={disabled}
      required
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[8.5rem] cursor-pointer appearance-none truncate bg-transparent pr-1 focus:outline-none disabled:cursor-not-allowed"
    >
      <option value="" disabled className="bg-[#0f111a] text-zinc-400">
        Select subject
      </option>
      {SUBJECTS.map((s) => (
        <option key={s.id} value={s.id} className="bg-[#0f111a] text-white">
          {s.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 opacity-70" aria-hidden="true" />
  </label>
);
