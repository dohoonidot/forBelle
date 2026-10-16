export type CompressedAlbumImage = {
  display: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  bytes: number;
};

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_ALBUM_FILES = 12;

const loadImage = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // iOS can reject HEIC here even when an <img> element can decode it.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
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
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas_unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") throw new Error("webp_unsupported");
  return { blob, width, height };
};

export const validateAlbumFile = (file: File) => {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("too_large");
};

export const compressAlbumImage = async (file: File): Promise<CompressedAlbumImage> => {
  validateAlbumFile(file);
  const source = await loadImage(file);
  try {
    const [display, thumbnail] = await Promise.all([
      renderWebp(source, 2048, 0.82),
      renderWebp(source, 640, 0.76)
    ]);
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

