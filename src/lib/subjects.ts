export interface Subject {
  /** Stable id sent to the AI backend, which uses it to pick the matching RAG model. */
  id: string;
  label: string;
}

/** Keep ids in sync with the subject -> RAG model mapping on your backend. */
export const SUBJECTS: Subject[] = [
  { id: 'accountancy', label: 'Accountancy' },
  { id: 'economics', label: 'Economics' },
];

const SUBJECT_KEY = 'aura_subject_v2';

export function getSubject(id: string | null | undefined): Subject | undefined {
  return SUBJECTS.find((s) => s.id === id);
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
