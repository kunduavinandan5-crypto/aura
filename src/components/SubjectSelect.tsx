import React from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { SUBJECTS } from '@/lib/subjects';

interface SubjectSelectProps {
  value: string;
  onChange: (subjectId: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Native <select> (accessible and touch-friendly) styled as a compact chip. */
export const SubjectSelect: React.FC<SubjectSelectProps> = ({ value, onChange, disabled, className = '' }) => (
  <label
    className={`relative flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1.5 pr-7 pl-2.5 text-[11px] font-medium text-zinc-200 focus-within:border-blue-500/50 ${className}`}
  >
    <BookOpen className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
    <span className="sr-only">Subject</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[9.5rem] cursor-pointer appearance-none truncate bg-transparent pr-1 focus:outline-none disabled:cursor-not-allowed"
    >
      {SUBJECTS.map((s) => (
        <option key={s.id} value={s.id} className="bg-[#0f111a] text-white">
          {s.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-zinc-400" aria-hidden="true" />
  </label>
);
