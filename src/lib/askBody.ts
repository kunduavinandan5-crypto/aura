/**
 * Builds the JSON body for POST {API}/ask. Kept free of app imports so it can be tested on its own.
 *
 *   question       the student's question
 *   student_class  "11" or "12" (plain string, no "Class", no number type); omitted if unknown
 *   subject        lowercase subject id, e.g. "accountancy"
 */
export interface AskBody {
  question: string;
  subject: string;
  student_class?: '11' | '12';
  /** Raw base64 JPEG/PNG WITHOUT the "data:image/...;base64," prefix. */
  image_base64?: string;
  image_media_type?: string;
}

/** "Class 12" / "12" / 12 -> "12"; "Class 11" -> "11"; anything else (unknown, other course) -> undefined. */
export function normalizeClass(studentClass?: string | number | null): '11' | '12' | undefined {
  const m = /(?:^|\D)(11|12)(?:\D|$)/.exec(String(studentClass ?? ''));
  return m ? (m[1] as '11' | '12') : undefined;
}

/** Subject ids go to the backend lowercase and trimmed: "Accountancy " -> "accountancy". */
export function normalizeSubject(subjectId: string): string {
  return subjectId.trim().toLowerCase();
}

export function buildAskBody(
  question: string,
  studentClass: string | number | null | undefined,
  subjectId: string,
  image?: { image_base64: string; image_media_type: string }
): AskBody {
  const body: AskBody = { question, subject: normalizeSubject(subjectId) };
  const cls = normalizeClass(studentClass);
  if (cls) body.student_class = cls;
  if (image) {
    body.image_base64 = image.image_base64;
    body.image_media_type = image.image_media_type;
  }
  return body;
}
