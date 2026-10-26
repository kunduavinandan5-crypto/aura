import { toast } from 'sonner';

/**
 * Reads question text out of photos in the browser. The RAG backend only accepts text, so a photo is
 * turned into text first and sent as the question. Runtime files are self-hosted under /ocr
 * (see scripts/copy-ocr-assets.mjs); nothing is loaded from a CDN and photos never leave the device.
 */
type OcrWorker = {
  recognize: (image: string) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) =>
        createWorker('eng', 1, {
          workerPath: '/ocr/worker.min.js',
          corePath: '/ocr',
          langPath: '/ocr',
          workerBlobURL: false, // CSP allows same-origin workers only
          gzip: true,
        })
      )
      .then((w) => w as unknown as OcrWorker)
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

const MAX_QUESTION_CHARS = 1200;
const MIN_CONFIDENCE = 35;

/** Drops lines that are mostly symbols (borders, smudges) and joins the rest into one question. */
function cleanOcrText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      if (l.length < 2) return false;
      const letters = (l.match(/[A-Za-z0-9]/g) ?? []).length;
      return letters / l.length >= 0.5;
    });
  return lines.join(' ').slice(0, MAX_QUESTION_CHARS).trim();
}

/** Text found in the photos, or '' when nothing readable was found. Throws AbortError if cancelled. */
export async function extractTextFromImages(images: string[], signal?: AbortSignal): Promise<string> {
  const toastId = toast.loading('Reading the text in your photo…');
  const onAbort = () => {
    const pending = workerPromise;
    workerPromise = null;
    pending?.then((w) => w.terminate()).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const worker = await getWorker();
    const parts: string[] = [];
    for (const image of images) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { data } = await worker.recognize(image);
      if (data.confidence >= MIN_CONFIDENCE) {
        const text = cleanOcrText(data.text);
        if (text) parts.push(text);
      }
    }
    return parts.join(' ').slice(0, MAX_QUESTION_CHARS);
  } catch (err: any) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    console.warn('Photo text reading failed:', err);
    return '';
  } finally {
    signal?.removeEventListener('abort', onAbort);
    toast.dismiss(toastId);
  }
}
