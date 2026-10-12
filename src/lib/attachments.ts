import { toast } from 'sonner';

export const MAX_IMAGES = 5;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Longest edge and JPEG quality for uploaded photos: keeps text in worksheets readable at ~100-250 KB each. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Downscales and re-encodes a photo as JPEG so a 5-photo question stays small (gallery photos are often 3-5 MB each).
 * Falls back to the original file if the browser can't decode or encode it.
 */
export async function compressImage(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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
    return out.startsWith('data:image/jpeg') ? out : readAsDataUrl(file);
  } catch {
    return readAsDataUrl(file);
  }
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
    toast.error(`You can attach a maximum of ${MAX_IMAGES} photos`);
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
