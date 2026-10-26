import { toast } from 'sonner';

/** The answer service reads one photo per question. */
export const MAX_IMAGES = 1;
export const MAX_IMAGES_MESSAGE = MAX_IMAGES === 1 ? 'You can attach one photo per question' : `You can attach a maximum of ${MAX_IMAGES} photos`;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Longest side (px) and JPEG quality of every photo that is sent: keeps a request well under ~1.5 MB. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;
/** An already-small JPEG is sent untouched (no second lossy re-encode). */
const KEEP_AS_IS_BYTES = 1_200_000;

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/**
 * Resizes (longest side <= MAX_EDGE) and re-encodes as JPEG on a canvas. Resolves null when the image is
 * already a small JPEG within the limit (the caller keeps the original). Throws if the browser can't decode it.
 */
async function resizeToJpeg(blob: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.type === 'image/jpeg' && blob.size <= KEEP_AS_IS_BYTES) {
    bitmap.close();
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#fff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!out.startsWith('data:image/jpeg')) throw new Error('jpeg encoding unsupported');
  return out;
}

/** Shrinks a picked photo as soon as it is attached (gallery photos are often 3-5 MB). Falls back to the original file. */
export async function compressImage(file: File): Promise<string> {
  try {
    return (await resizeToJpeg(file)) ?? (await readAsDataUrl(file));
  } catch {
    return readAsDataUrl(file);
  }
}

/**
 * The image part of a /ask request: raw base64 (no "data:...;base64," prefix) plus its media type, resized to
 * at most MAX_EDGE px and JPEG quality 0.8. Camera frames are shrunk here too.
 */
export async function toRequestImage(dataUrl: string): Promise<{ image_base64: string; image_media_type: string }> {
  let finalUrl = dataUrl;
  try {
    finalUrl = (await resizeToJpeg(dataUrlToBlob(dataUrl))) ?? dataUrl;
  } catch {
    /* can't re-encode: send the original */
  }
  return {
    image_base64: finalUrl.slice(finalUrl.indexOf(',') + 1),
    image_media_type: /data:([^;]+)/.exec(finalUrl)?.[1] ?? 'image/jpeg',
  };
}

/**
 * Reads the given files as data URLs, keeping only images and never letting the total
 * (existing + new) exceed MAX_IMAGES. Shows a toast when files are skipped.
 */
export async function readImageFiles(files: File[], existingCount: number): Promise<string[]> {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length < files.length) toast.error('Only image files can be attached');

  const room = Math.max(0, MAX_IMAGES - existingCount);
  if (images.length > room) {
    toast.error(MAX_IMAGES_MESSAGE);
  }
  const accepted = images.slice(0, room);

  try {
    return await Promise.all(accepted.map(compressImage));
  } catch {
    toast.error('Could not read one of the selected photos');
    return [];
  }
}

/** Opens an attached photo in a new tab. Browsers block top-level navigation to data: URLs, so use a blob URL. */
export function openImageInNewTab(dataUrl: string): void {
  try {
    const [header, base64] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg';
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error('Could not open the photo');
  }
}
