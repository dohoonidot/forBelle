export type CompressedAlbumImage = {
  display: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  bytes: number;
};

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_ALBUM_FILES = 12;
const FALLBACK_IMAGE_EXTENSION = /\.(?:avif|gif|hei[cf]|jpe?g|png|webp)$/i;
const HEIC_EXTENSION = /\.(?:hei[cf])$/i;

const isHeicFile = (file: File) =>
  /image\/(?:hei[cf]|heif-sequence|heic-sequence)/i.test(file.type) || HEIC_EXTENSION.test(file.name);

const loadImageBlob = async (blob: Blob): Promise<ImageBitmap | HTMLImageElement> => {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // iOS can reject HEIC here even when an <img> element can decode it.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    image.src = url;
  });
};

const loadImage = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  try {
    return await loadImageBlob(file);
  } catch (nativeError) {
    if (!isHeicFile(file)) throw nativeError;

    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      if (!jpeg) throw new Error("heic_decode_failed");
      return await loadImageBlob(jpeg);
    } catch {
      throw new Error("heic_decode_failed");
    }
  }
};

const getDimensions = (source: ImageBitmap | HTMLImageElement) => ({
  width: "naturalWidth" in source ? source.naturalWidth : source.width,
  height: "naturalHeight" in source ? source.naturalHeight : source.height
});

const renderWebp = async (
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> => {
  const original = getDimensions(source);
  const scale = Math.min(1, maxEdge / Math.max(original.width, original.height));
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("webp_unsupported");
    return { blob, width, height };
  } finally {
    // Large iPhone photos can otherwise leave two full canvas buffers alive at once.
    canvas.width = 1;
    canvas.height = 1;
  }
};

export const validateAlbumFile = (file: File) => {
  if (!file.type.startsWith("image/") && !FALLBACK_IMAGE_EXTENSION.test(file.name)) {
    throw new Error("not_image");
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error("too_large");
};

export const compressAlbumImage = async (file: File): Promise<CompressedAlbumImage> => {
  validateAlbumFile(file);
  const source = await loadImage(file);
  try {
    // Render sequentially to keep peak memory low on iPhone Safari.
    const display = await renderWebp(source, 2048, 0.82);
    const thumbnail = await renderWebp(source, 640, 0.76);
    return {
      display: display.blob,
      thumbnail: thumbnail.blob,
      width: display.width,
      height: display.height,
      bytes: display.blob.size + thumbnail.blob.size
    };
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
};

