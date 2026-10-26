/**
 * lib/subjects.ts
 *
 * DESIGN: the admin decides each student's CLASS and SUBJECT(S) in Supabase
 * (class_11_students / class_12_students). The app only ever offers the subject(s) assigned to the
 * signed-in student; the backend receives:
 *   - student_class → from UserProfile.studentClass (the student's record)
 *   - subject       → one of the student's assigned subjects, lowercase
 *
 * A student's `subject` field may hold one subject ("Accountancy") or several separated by a comma,
 * slash, semicolon or "&" ("Accountancy, Economics").
 */

import { ALL_SUBJECTS } from '@/subjects';

export interface Subject {
  /** Stable lowercase id sent to the RAG backend (e.g. "accountancy"). */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Optional short description shown in the dropdown. */
  description?: string;
}

/**
 * Subjects with study material in the catalog (src/subjects/index.ts).
 * Subjects assigned to a student but missing here are still sent to the backend, which answers
 * that it has no material for them yet.
 */
export const SUBJECTS: Subject[] = ALL_SUBJECTS.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
}));

const SUBJECT_KEY = 'aura_subject_v2';

/** Other spellings an admin may type in the student table, mapped to the catalog id. */
const ALIASES: Record<string, string> = {
  accounts: 'accountancy',
  account: 'accountancy',
  accounting: 'accountancy',
};

const slug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function getSubject(idOrLabel: string | null | undefined): Subject | undefined {
  if (!idOrLabel) return undefined;
  const clean = slug(idOrLabel);
  const id = ALIASES[clean] ?? clean;
  return SUBJECTS.find((s) => s.id.toLowerCase() === id || s.label.toLowerCase() === clean);
}

const titleCase = (value: string) => value.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The subject(s) the admin assigned to this student, from their record. Subjects that exist in the
 * catalog keep their label; others become a plain lowercase id (so the backend can say it has no
 * material yet). Empty when the account has no subject.
 */
export function assignedSubjects(profileSubject: string | null | undefined): Subject[] {
  const out: Subject[] = [];
  for (const raw of (profileSubject ?? '').split(/[,;/|&]+/)) {
    const token = slug(raw);
    if (!token) continue;
    const subject = getSubject(token) ?? { id: token, label: titleCase(token) };
    if (!out.some((s) => s.id === subject.id)) out.push(subject);
  }
  return out;
}

/** Returns the saved subject id (lowercase), or '' when the user has not chosen one yet. */
export function loadSubjectId(): string {
  try {
    return slug(localStorage.getItem(SUBJECT_KEY) ?? '');
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
