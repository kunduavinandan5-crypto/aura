/**
 * lib/subjects.ts
 *
 * Subject list for the UI selector.
 *
 * DESIGN: The user only picks a SUBJECT here.
 * The student's CLASS is set by the admin in Supabase (profiles.student_class)
 * and is read from the UserProfile on login.  The backend receives both:
 *   - subject      → chosen here by the student
 *   - student_class → from UserProfile.studentClass (Supabase)
 */

import { ALL_SUBJECTS } from '@/subjects';

export interface Subject {
  /** Stable id sent to the RAG backend (e.g. "accountancy"). */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Optional short description shown in the dropdown. */
  description?: string;
}

/**
 * Subjects available in the UI.
 * Built from the subjects catalog — add new subjects in src/subjects/index.ts.
 */
export const SUBJECTS: Subject[] = ALL_SUBJECTS.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
}));

const SUBJECT_KEY = 'aura_subject_v2';

export function getSubject(idOrLabel: string | null | undefined): Subject | undefined {
  if (!idOrLabel) return undefined;
  const clean = idOrLabel.trim().toLowerCase();
  return SUBJECTS.find((s) => s.id.toLowerCase() === clean || s.label.toLowerCase() === clean);
}

/** Returns the saved subject id, or '' when the user has not chosen one yet. */
export function loadSubjectId(): string {
  try {
    return getSubject(localStorage.getItem(SUBJECT_KEY))?.id ?? '';
  } catch {
    return '';
  }
}

export function saveSubjectId(id: string): void {
  try {
    localStorage.setItem(SUBJECT_KEY, id);
  } catch {
    /* storage unavailable: selection just won't persist */
  }
}
