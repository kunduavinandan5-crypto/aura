/**
 * subjects/class11/accountancy.ts
 *
 * Catalog entry for Class 11 – Accountancy.
 * This defines metadata used by the UI (label, description).
 * The class is NOT stored here — it comes from the student's Supabase profile
 * set by the admin.
 */

export interface SubjectConfig {
  /** Stable ID sent to the RAG backend (must match the vector-store collection name). */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Optional description shown as a subtitle in the subject picker. */
  description?: string;
}

const accountancyClass11: SubjectConfig = {
  id: 'accountancy',
  label: 'Accountancy',
};

export default accountancyClass11;
