import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown } from 'lucide-react';
import { SUBJECTS } from '@/lib/subjects';

interface SubjectSelectProps {
  /** Selected subject id, or '' when nothing is chosen yet. */
  value: string;
  onChange: (subjectId: string) => void;
  disabled?: boolean;
  className?: string;
  /** 'chip' (default) for the input bar; 'header' renders "Aura <subject> v" as a top-bar title. */
  variant?: 'chip' | 'header';
}

const MENU_HEIGHT = 120; // px of space needed to open downwards

/** Custom listbox dropdown: keyboard accessible, flips upward near the bottom edge, highlights until chosen. */
export const SubjectSelect: React.FC<SubjectSelectProps> = ({
  value,
  onChange,
  disabled,
  className = '',
  variant = 'chip',
}) => {
  const isHeader = variant === 'header';
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = SUBJECTS.find((s) => s.id === value);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    setOpenUp(Boolean(rect && window.innerHeight - rect.bottom < MENU_HEIGHT));
    setActive(Math.max(0, SUBJECTS.findIndex((s) => s.id === value)));
    setOpen(true);
  }, [disabled, value]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const choose = (id: string) => {
    onChange(id);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i + 1) % SUBJECTS.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i - 1 + SUBJECTS.length) % SUBJECTS.length);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(SUBJECTS.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(SUBJECTS[active].id);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Subject${selected ? `: ${selected.label}` : ' (required)'}`}
        className={
          isHeader
            ? 'flex items-center gap-1.5 rounded-full px-3 py-2 text-base transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60'
            : `flex items-center gap-2 rounded-full border py-1.5 pr-2.5 pl-3 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-blue-400/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20'
                  : 'border-amber-400/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
              }`
        }
      >
        {isHeader ? (
          <>
            <span className="font-semibold text-white">Aura</span>
            <span className={`whitespace-nowrap ${selected ? 'text-zinc-400' : 'text-amber-300'}`}>
              {selected ? selected.label : 'Select subject'}
            </span>
          </>
        ) : (
          <>
            <BookOpen className={`h-3.5 w-3.5 ${selected ? 'text-blue-300' : 'text-amber-300'}`} aria-hidden="true" />
            <span className="whitespace-nowrap">{selected ? selected.label : 'Select subject'}</span>
          </>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Subjects"
          className={`absolute left-0 z-50 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#12141f]/98 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl anim-fade-up ${
            openUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {SUBJECTS.map((s, i) => {
            const isSelected = s.id === value;
            return (
              <li
                key={s.id}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isSelected ? 'text-blue-200' : 'text-zinc-200'
                } ${i === active ? 'bg-white/10' : ''}`}
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen className={`h-4 w-4 ${isSelected ? 'text-blue-300' : 'text-zinc-500'}`} aria-hidden="true" />
                  {s.label}
                </span>
                {isSelected && <Check className="h-4 w-4 text-blue-300" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
