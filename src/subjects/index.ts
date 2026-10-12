/**
 * subjects/index.ts
 *
 * Central subject catalog.
 * Each entry is a subject the UI can offer.  The student's CLASS comes from
 * their Supabase profile (set by the admin) — it is NOT stored here.
 *
 * To add a new subject: create its config file under the relevant class folder,
 * then add it to ALL_SUBJECTS below.
 */

export type { SubjectConfig } from './class11/accountancy';
export { default as accountancyClass11 } from './class11/accountancy';
export { default as accountancyClass12 } from './class12/accountancy';

import type { SubjectConfig } from './class11/accountancy';
import accountancyClass11 from './class11/accountancy';

/**
 * All subjects available in the UI.
 * Class filtering is done on the backend using the student_class from the
 * user's Supabase profile — not here.
 */
export const ALL_SUBJECTS: SubjectConfig[] = [
  accountancyClass11,
  // Add more subjects here as needed:
  // economicsClass11, physicsClass11, ...
];
