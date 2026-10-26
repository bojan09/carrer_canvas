import { PHOTO_MAX_CHARS } from "../models/resume.js";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SIZE = 320;

/** Centre-crops to a square and re-encodes as a small JPEG data URL. Drawing through a canvas
 *  also drops EXIF metadata (location, camera, etc.), so none of it is stored or exported.
 *  @throws Error with message 'type' | 'size' | 'decode' | 'big' */
export async function compressPhoto(file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("type");
  if (file.size > 15 * 1024 * 1024) throw new Error("size");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("decode");
  }
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  for (const quality of [0.85, 0.75, 0.62, 0.5, 0.4]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length <= PHOTO_MAX_CHARS) return { data, width: SIZE, height: SIZE };
  }
  throw new Error("big");
}

export const PHOTO_ERRORS = {
  type: "Choose a JPEG, PNG or WebP image.",
  size: "That image is larger than 15 MB. Choose a smaller one.",
  decode: "This browser could not read that image. Try a JPEG or PNG.",
  big: "That image could not be compressed small enough. Try another.",
};
