import { toast } from 'sonner';

export const MAX_IMAGES = 5;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

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
    return await Promise.all(accepted.map(readAsDataUrl));
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
