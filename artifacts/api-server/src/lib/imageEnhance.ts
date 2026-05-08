// Server-side image enhancement pipeline applied to uploads. The original is
// always preserved separately; this returns a derivative buffer.
//
// Pipeline (in order):
//   1. auto-orient using EXIF
//   2. cap to 1600px on the long edge (no upscaling)
//   3. center-crop to a 4:3 aspect for menu hero usage
//   4. normalise tonal range (auto-exposure / white balance)
//   5. modulate saturation +10% for appetising look
//   6. mild sharpening
//   7. encode as JPEG quality 85, mozjpeg-style, stripping metadata
//
// Returns the JPEG buffer plus a list of pipeline step ids for provenance.
export interface EnhanceResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  pipeline: string[];
}

const TARGET_LONG_EDGE = 1600;
const TARGET_AR = 4 / 3;

export async function enhanceImage(input: Buffer): Promise<EnhanceResult> {
  const sharpMod = (await import("sharp")).default;
  const pipeline: string[] = [];

  let img = sharpMod(input, { failOn: "none" }).rotate();
  pipeline.push("rotate-exif");

  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) throw new Error("could not read image dimensions");

  // Resize long edge.
  if (Math.max(w, h) > TARGET_LONG_EDGE) {
    img = img.resize({
      width: w >= h ? TARGET_LONG_EDGE : undefined,
      height: h > w ? TARGET_LONG_EDGE : undefined,
      withoutEnlargement: true,
    });
    pipeline.push(`resize-long-edge-${TARGET_LONG_EDGE}`);
  }

  // Center crop to 4:3.
  const curW = Math.min(w, w >= h ? TARGET_LONG_EDGE : Math.round((w / h) * TARGET_LONG_EDGE));
  const curH = Math.min(h, h > w ? TARGET_LONG_EDGE : Math.round((h / w) * TARGET_LONG_EDGE));
  const targetW = Math.min(curW, Math.round(curH * TARGET_AR));
  const targetH = Math.min(curH, Math.round(curW / TARGET_AR));
  if (targetW > 0 && targetH > 0 && (targetW !== curW || targetH !== curH)) {
    img = img.resize({
      width: targetW,
      height: targetH,
      fit: "cover",
      position: "attention",
    });
    pipeline.push("crop-4x3-attention");
  }

  img = img.normalise();
  pipeline.push("auto-tone-normalise");

  img = img.modulate({ saturation: 1.1 });
  pipeline.push("saturation-1.1");

  img = img.sharpen({ sigma: 0.6 });
  pipeline.push("sharpen-0.6");

  const out = await img
    .jpeg({ quality: 85, mozjpeg: true })
    .withMetadata({ exif: {} })
    .toBuffer({ resolveWithObject: true });
  pipeline.push("jpeg-q85-mozjpeg");

  return {
    buffer: out.data,
    mimeType: "image/jpeg",
    width: out.info.width,
    height: out.info.height,
    pipeline,
  };
}

// Standardise an AI-generated image so it lives in the same dimension /
// encoding envelope as enhanced uploads. PNG transparency is preserved when
// `keepTransparency` is true (e.g. background-removal output).
export async function normaliseGenerated(
  input: Buffer,
  opts: { keepTransparency?: boolean } = {},
): Promise<EnhanceResult> {
  const sharpMod = (await import("sharp")).default;
  let img = sharpMod(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (Math.max(w, h) > TARGET_LONG_EDGE) {
    img = img.resize({
      width: w >= h ? TARGET_LONG_EDGE : undefined,
      height: h > w ? TARGET_LONG_EDGE : undefined,
      withoutEnlargement: true,
    });
  }
  if (opts.keepTransparency) {
    const out = await img.png().toBuffer({ resolveWithObject: true });
    return {
      buffer: out.data,
      mimeType: "image/png",
      width: out.info.width,
      height: out.info.height,
      pipeline: ["normalise-png"],
    };
  }
  const out = await img
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mimeType: "image/jpeg",
    width: out.info.width,
    height: out.info.height,
    pipeline: ["normalise-jpeg"],
  };
}
