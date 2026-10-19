// The owner's own wallpaper photo, kept in this browser's IndexedDB (too large
// for localStorage). Images are downscaled before storing so a 20 MB camera
// photo becomes a few hundred KB.

const DB = "pos";
const STORE = "blobs";
const KEY = "wallpaper";
const MAX_EDGE = 2560;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadWallpaper = () => tx<Blob | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<Blob | undefined>).catch(() => undefined);
export const saveWallpaper = (blob: Blob) => tx("readwrite", (s) => s.put(blob, KEY));
export const clearWallpaper = () => tx("readwrite", (s) => s.delete(KEY));

/** Decode, downscale to MAX_EDGE and re-encode as JPEG. Throws on non-images. */
export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("too-large");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("not-image"); });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("not-image"))), "image/jpeg", 0.86));
}

/** Average colour of the image, used as the backdrop while it fades in. */
export async function averageColor(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 1, 1);
  bitmap.close();
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
