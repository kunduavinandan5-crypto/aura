export interface Subject {
  /** Stable id sent to the AI backend, which uses it to pick the matching RAG model / collection. */
  id: string;
  label: string;
}

/** Keep ids in sync with the subject->RAG mapping on your backend. */
export const SUBJECTS: Subject[] = [
  { id: 'general', label: 'General' },
  { id: 'accountancy', label: 'Accountancy' },
  { id: 'economics', label: 'Economics' },
  { id: 'business-studies', label: 'Business Studies' },
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'biology', label: 'Biology' },
  { id: 'english', label: 'English' },
  { id: 'computer-science', label: 'Computer Science' },
];

export const DEFAULT_SUBJECT_ID = 'general';

const SUBJECT_KEY = 'aura_subject_v1';

export function getSubject(id: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];
}

export function loadSubjectId(): string {
  try {
    return getSubject(localStorage.getItem(SUBJECT_KEY)).id;
  } catch {
    return DEFAULT_SUBJECT_ID;
  }
}

export function saveSubjectId(id: string): void {
  try {
    localStorage.setItem(SUBJECT_KEY, id);
  } catch {
    /* storage unavailable: selection just won't persist */
  }
}
