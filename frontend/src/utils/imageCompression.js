// Phone photos arrive at 3-6 MB each (12+ megapixels). A field report prints
// them a few inches wide, so before upload they are scaled to at most
// MAX_DIMENSION px on the long side and re-encoded as JPEG: typically a few
// hundred KB, around a tenth of the original, with no visible loss on screen
// or in the PDF. Anything this cannot decode or shrink is uploaded as it came.
//
// Re-encoding drops the photo's embedded EXIF metadata (camera, GPS). The
// orientation is applied to the pixels first, so photos stay upright.
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;
// Already small enough: re-encoding would save little and cost quality.
const SKIP_BELOW_BYTES = 500 * 1024;
const COMPRESSIBLE_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif)$/i;

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to an <img>, which decodes some formats bitmaps refuse.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImageForUpload(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (!(file instanceof Blob) || !COMPRESSIBLE_TYPES.test(file.type || "")) return file;
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const image = await decodeImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return file;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: a transparent PNG gets white, not black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    image.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;

    const baseName = String(file.name || "photo").replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
  } catch (error) {
    console.warn("[Image compression] Uploading the original file instead", error);
    return file;
  }
}
