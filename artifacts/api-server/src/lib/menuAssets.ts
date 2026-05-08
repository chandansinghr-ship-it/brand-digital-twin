import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  type AssetKind,
  type AssetProvenance,
  type MenuItemAsset,
  menuItemAssetsTable,
} from "@workspace/db";
import {
  generateImage,
  editImage,
} from "@workspace/integrations-gemini-ai/image";
import {
  enhanceImage,
  normaliseGenerated,
  type EnhanceResult,
} from "./imageEnhance";
import { readAssetBytes, saveAssetBytes } from "./imageStorage";
import type { MenuItem } from "@workspace/db";
import { setImage } from "./menu";

export type { EnhanceResult } from "./imageEnhance";

const HERO_PROMPT_BASE = `You are creating a hero photo for an Indian wellness food brand called Tanmatra.
Style:
- top-down 45° angle, single hero dish on a hand-thrown ceramic plate or bowl
- warm natural daylight from the upper left, soft shadows
- background: light oak wooden table, a few subtle props (linen napkin, tiny bowl of garnish)
- vibrant fresh ingredients, glistening textures, no people, no text overlay, no logo
- composition leaves a bit of negative space at the top for marketing copy
- realistic photography, NOT illustration, NOT AI-art aesthetic

Dish: %DISH%
Description: %DESC%
Tags: %TAGS%
Vegetarian: %VEG%`;

function buildHeroPrompt(item: MenuItem): string {
  return HERO_PROMPT_BASE.replaceAll("%DISH%", item.name)
    .replaceAll("%DESC%", item.description || "(no description)")
    .replaceAll("%TAGS%", (item.tags ?? []).join(", ") || "(none)")
    .replaceAll("%VEG%", item.isVeg ? "yes" : "no");
}

async function persistAsset(input: {
  slug: string;
  kind: AssetKind;
  result: EnhanceResult;
  provenance: AssetProvenance;
  sourceAssetId?: number | null;
  isAiGenerated: boolean;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const stored = await saveAssetBytes({
    slug: input.slug,
    kind: input.kind,
    buffer: input.result.buffer,
    mimeType: input.result.mimeType,
  });
  const [row] = await db
    .insert(menuItemAssetsTable)
    .values({
      slug: input.slug,
      kind: input.kind,
      storagePath: stored.storagePath,
      publicUrl: stored.publicUrl,
      mimeType: input.result.mimeType,
      width: input.result.width,
      height: input.result.height,
      bytes: input.result.buffer.length,
      sourceAssetId: input.sourceAssetId ?? null,
      provenance: input.provenance,
      isAiGenerated: input.isAiGenerated ? 1 : 0,
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new Error("asset insert failed");
  return row;
}

export async function listAssetsForSlug(
  slug: string,
): Promise<MenuItemAsset[]> {
  return db
    .select()
    .from(menuItemAssetsTable)
    .where(
      and(eq(menuItemAssetsTable.slug, slug), isNull(menuItemAssetsTable.deletedAt)),
    )
    .orderBy(desc(menuItemAssetsTable.createdAt));
}

export async function findAssetById(
  id: number,
): Promise<MenuItemAsset | null> {
  const [row] = await db
    .select()
    .from(menuItemAssetsTable)
    .where(eq(menuItemAssetsTable.id, id))
    .limit(1);
  return row ?? null;
}

// Active = exists and not soft-deleted. Used by mutation helpers that must
// refuse to operate on a tombstoned row.
export async function findActiveAssetById(
  id: number,
): Promise<MenuItemAsset | null> {
  const [row] = await db
    .select()
    .from(menuItemAssetsTable)
    .where(
      and(eq(menuItemAssetsTable.id, id), isNull(menuItemAssetsTable.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

export async function softDeleteAsset(id: number): Promise<MenuItemAsset | null> {
  const [row] = await db
    .update(menuItemAssetsTable)
    .set({ deletedAt: new Date() })
    .where(eq(menuItemAssetsTable.id, id))
    .returning();
  return row ?? null;
}

// === Upload + enhancement =================================================

export async function ingestUpload(input: {
  slug: string;
  buffer: Buffer;
  mimeType: string;
  createdBy: string | null;
}): Promise<{ original: MenuItemAsset; enhanced: MenuItemAsset }> {
  if (input.buffer.length > 10 * 1024 * 1024)
    throw new Error("image larger than 10MB not supported");

  // Run the enhancement (and decode the input) BEFORE we persist anything.
  // This keeps the upload atomic from the editor's perspective: a corrupt
  // file rejects with no orphan original row.
  const enhancedResult = await enhanceImage(input.buffer);

  const original = await persistAsset({
    slug: input.slug,
    kind: "original",
    result: {
      buffer: input.buffer,
      mimeType: input.mimeType,
      width: 0,
      height: 0,
      pipeline: [],
    },
    provenance: { source: "upload", createdBy: input.createdBy },
    isAiGenerated: false,
    createdBy: input.createdBy,
  });

  let enhanced: MenuItemAsset;
  try {
    enhanced = await persistAsset({
      slug: input.slug,
      kind: "enhanced",
      result: enhancedResult,
      provenance: {
        source: "sharp-enhance",
        pipeline: enhancedResult.pipeline,
        createdBy: input.createdBy,
      },
      sourceAssetId: original.id,
      isAiGenerated: false,
      createdBy: input.createdBy,
    });
  } catch (err) {
    // Compensate: tombstone the orphan original we just wrote.
    await softDeleteAsset(original.id).catch(() => undefined);
    throw err;
  }
  return { original, enhanced };
}

// Re-run the enhancement pipeline on an existing asset (e.g. after
// adjusting the originals or re-trying a previously poor crop).
export async function reEnhanceAsset(input: {
  sourceAssetId: number;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const src = await findAssetById(input.sourceAssetId);
  if (!src) throw new Error("source asset not found");
  const { buffer } = await readAssetBytes(src.storagePath);
  const result = await enhanceImage(buffer);
  return persistAsset({
    slug: src.slug,
    kind: "enhanced",
    result,
    provenance: {
      source: "sharp-enhance",
      pipeline: result.pipeline,
      createdBy: input.createdBy,
    },
    sourceAssetId: src.id,
    isAiGenerated: false,
    createdBy: input.createdBy,
  });
}

// === AI hero generation ===================================================

export async function generateHeroAsset(input: {
  item: MenuItem;
  extraInstructions?: string;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const prompt =
    buildHeroPrompt(input.item) +
    (input.extraInstructions ? `\nExtra: ${input.extraInstructions}` : "");
  const ai = await generateImage(prompt);
  const buf = Buffer.from(ai.b64_json, "base64");
  const norm = await normaliseGenerated(buf, { keepTransparency: false });
  return persistAsset({
    slug: input.item.slug,
    kind: "hero",
    result: norm,
    provenance: {
      source: "ai-generate",
      model: "gemini-2.5-flash-image",
      prompt,
      createdBy: input.createdBy,
    },
    sourceAssetId: null,
    isAiGenerated: true,
    createdBy: input.createdBy,
  });
}

// === Background removal ===================================================

const BG_REMOVE_PROMPT = `Remove the background completely. Keep only the food / dish in the foreground, with crisp, anti-aliased edges. The new background must be fully transparent (alpha channel). Do not add any new background, do not change colour or lighting of the dish itself, do not add shadows or props.`;

export async function removeBackgroundAsset(input: {
  sourceAssetId: number;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const src = await findAssetById(input.sourceAssetId);
  if (!src) throw new Error("source asset not found");
  const { buffer, mimeType } = await readAssetBytes(src.storagePath);
  const ai = await editImage({
    prompt: BG_REMOVE_PROMPT,
    imageBase64: buffer.toString("base64"),
    mimeType,
  });
  const outBuf = Buffer.from(ai.b64_json, "base64");
  const norm = await normaliseGenerated(outBuf, { keepTransparency: true });
  return persistAsset({
    slug: src.slug,
    kind: "nobg",
    result: norm,
    provenance: {
      source: "ai-edit",
      model: "gemini-2.5-flash-image",
      prompt: BG_REMOVE_PROMPT,
      createdBy: input.createdBy,
    },
    sourceAssetId: src.id,
    isAiGenerated: true,
    createdBy: input.createdBy,
  });
}

// === Set primary ==========================================================

export async function setAssetAsPrimary(input: {
  assetId: number;
  expectedSlug?: string;
}): Promise<{ asset: MenuItemAsset; item: MenuItem | null }> {
  const asset = await findActiveAssetById(input.assetId);
  if (!asset) throw new Error("asset not found or has been deleted");
  if (input.expectedSlug && asset.slug !== input.expectedSlug) {
    throw new Error(
      `asset ${input.assetId} belongs to slug "${asset.slug}", not "${input.expectedSlug}"`,
    );
  }
  const item = await setImage(asset.slug, asset.publicUrl);
  return { asset, item };
}
