import { z } from "zod/v4";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import { recordOpsAction } from "../../opsAudit";
import {
  bulkSetAvailability,
  createMenuItem,
  findBySlug,
  listMenuItems,
  previewMatchingItems,
  setAvailability,
  setImage,
  summarizeForPreview,
  updatePrice,
} from "../../menu";

const CMS_PROMPT = definePrompt({
  name: "cms-agent",
  version: "v1",
  build: () =>
    `You are the Tanmatra CMS Assistant for the catalog editing team.

YOUR SCOPE — you MAY help with:
- Creating new menu items (create_menu_item)
- Updating prices (update_price)
- Toggling availability of one item (toggle_availability)
- Setting an item's image URL (upload_image)
- Listing items / inspecting state (list_menu_items)
- Bulk-toggling availability across a filtered set (bulk_toggle_availability)

OUT OF SCOPE — refuse politely:
- Anything customer-facing or order/operations work
- Copywriting / auto-tagging beyond what the editor explicitly types
  (a separate agent will handle that)
- Photo enhancement (a separate agent will handle that)
- Permanent deletion of items

CONFIRMATION RULES — non-negotiable:
- EVERY mutating tool call has a two-step flow:
  1. First call WITHOUT \`confirm: true\`. The tool returns a "preview"
     payload describing exactly what would change.
  2. Echo that preview back to the editor in plain language and ask
     "Confirm? (yes / no)".
  3. ONLY after the editor explicitly confirms, call again with
     \`confirm: true\` to commit the write.
- Bulk operations carry the same two-step flow plus an explicit count
  ("This will affect 12 items in HSR Kitchen — confirm?").
- Read-only tools (list_menu_items) do not require confirmation.

GENERAL RULES:
- Never invent slugs, categories, or kitchen locations. If you do not
  know one, call list_menu_items to discover it.
- Prices are in PAISE (₹220 = 22000 paise). Always restate the rupee
  value when previewing.
- Availability windows are one or more of: "breakfast", "lunch",
  "dinner", "all_day".
- EVERY tool call MUST include a \`reasoning\` argument summarising why
  the action is being taken. This is persisted to the audit log.`,
});

const REASONING = z
  .string()
  .min(3)
  .describe("Why this action is being taken — persisted to audit log.");

const listItems = defineTool({
  name: "list_menu_items",
  description:
    "List CMS menu items, optionally filtered by category, kitchenLocation, availability flag, or name search. Read-only. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    category: z.string().optional(),
    kitchenLocation: z.string().optional(),
    available: z.boolean().optional(),
    q: z.string().optional(),
    limit: z.number().int().positive().max(100).default(20),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const items = await listMenuItems({
      category: input.category,
      kitchenLocation: input.kitchenLocation,
      available: input.available,
      q: input.q,
    });
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "cms_list_menu_items",
      params: input,
      beforeState: null,
      afterState: { count: items.length },
      status: "success",
      reasoning: input.reasoning,
    });
    return {
      success: true as const,
      items: items.slice(0, input.limit).map((it) => ({
        slug: it.slug,
        name: it.name,
        category: it.category,
        kitchenLocation: it.kitchenLocation,
        priceRupees: it.pricePaise / 100,
        isVeg: it.isVeg,
        isAvailable: it.isAvailable,
        availabilityWindow: it.availabilityWindow,
      })),
      total: items.length,
    };
  },
});

const createItem = defineTool({
  name: "create_menu_item",
  description:
    "Create a new menu item. TWO-STEP: call without confirm:true to preview; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    name: z.string().min(1).max(200),
    priceRupees: z.number().min(0).max(100000),
    category: z.string().min(1).max(64),
    kitchenLocation: z.string().max(128).optional(),
    isVeg: z.boolean().optional(),
    description: z.string().max(2000).optional(),
    availabilityWindow: z
      .array(z.enum(["breakfast", "lunch", "dinner", "all_day"]))
      .optional(),
    tags: z.array(z.string().max(64)).optional(),
    imageUrl: z.string().url().optional(),
    slug: z.string().max(128).optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const pricePaise = Math.round(input.priceRupees * 100);
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          willCreate: {
            name: input.name,
            priceRupees: input.priceRupees,
            pricePaise,
            category: input.category,
            kitchenLocation: input.kitchenLocation ?? "default",
            isVeg: input.isVeg ?? true,
            availabilityWindow: input.availabilityWindow ?? ["all_day"],
            tags: input.tags ?? [],
          },
        },
        confirmRequired: true as const,
      };
    }
    try {
      const item = await createMenuItem({
        name: input.name,
        pricePaise,
        category: input.category,
        kitchenLocation: input.kitchenLocation,
        isVeg: input.isVeg,
        description: input.description,
        availabilityWindow: input.availabilityWindow,
        tags: input.tags,
        imageUrl: input.imageUrl ?? null,
        slug: input.slug,
      });
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_create_menu_item",
        params: input,
        beforeState: null,
        afterState: { id: item.id, slug: item.slug, pricePaise: item.pricePaise },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: item.slug,
        id: item.id,
        priceRupees: item.pricePaise / 100,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_create_menu_item",
        params: input,
        beforeState: null,
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const updatePriceTool = defineTool({
  name: "update_price",
  description:
    "Change the price of one menu item. TWO-STEP: call without confirm:true to preview the before/after; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    priceRupees: z.number().min(0).max(100000),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    const pricePaise = Math.round(input.priceRupees * 100);
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeRupees: before.pricePaise / 100,
          afterRupees: pricePaise / 100,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await updatePrice(input.slug, pricePaise);
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_update_price",
        params: input,
        beforeState: { pricePaise: before.pricePaise },
        afterState: { pricePaise: after?.pricePaise ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        beforeRupees: before.pricePaise / 100,
        afterRupees: (after?.pricePaise ?? before.pricePaise) / 100,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_update_price",
        params: input,
        beforeState: { pricePaise: before.pricePaise },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const toggleAvailability = defineTool({
  name: "toggle_availability",
  description:
    "Mark a single menu item available or unavailable. TWO-STEP: call without confirm:true to preview; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    available: z.boolean(),
    reason: z.string().max(500).optional(),
    unavailableUntil: z.string().datetime().optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeAvailable: before.isAvailable,
          afterAvailable: input.available,
          reason: input.reason ?? null,
          unavailableUntil: input.unavailableUntil ?? null,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await setAvailability(
        input.slug,
        input.available,
        input.reason ?? null,
        input.unavailableUntil ? new Date(input.unavailableUntil) : null,
      );
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_toggle_availability",
        params: input,
        beforeState: { isAvailable: before.isAvailable },
        afterState: { isAvailable: after?.isAvailable ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        beforeAvailable: before.isAvailable,
        afterAvailable: after?.isAvailable ?? null,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_toggle_availability",
        params: input,
        beforeState: { isAvailable: before.isAvailable },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const uploadImage = defineTool({
  name: "upload_image",
  description:
    "Set a menu item's image URL (the editor uploads/hosts the file separately and pastes the URL). TWO-STEP: call without confirm:true to preview before/after URLs; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    imageUrl: z.string().url(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeImageUrl: before.imageUrl,
          afterImageUrl: input.imageUrl,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await setImage(input.slug, input.imageUrl);
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_upload_image",
        params: input,
        beforeState: { imageUrl: before.imageUrl },
        afterState: { imageUrl: after?.imageUrl ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        imageUrl: after?.imageUrl ?? null,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_upload_image",
        params: input,
        beforeState: { imageUrl: before.imageUrl },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const bulkToggle = defineTool({
  name: "bulk_toggle_availability",
  description:
    "Apply an availability change to every item matching a filter (category and/or kitchenLocation, or an explicit list of slugs). TWO-STEP: call without confirm:true to preview the matched set + count; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    category: z.string().optional(),
    kitchenLocation: z.string().optional(),
    slugs: z.array(z.string().max(128)).optional(),
    available: z.boolean(),
    reason: z.string().max(500).optional(),
    unavailableUntil: z.string().datetime().optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const filter = {
      category: input.category,
      kitchenLocation: input.kitchenLocation,
      slugs: input.slugs,
    };
    if (
      !input.category &&
      !input.kitchenLocation &&
      (!input.slugs || input.slugs.length === 0)
    ) {
      return {
        success: false as const,
        error:
          "Refuse to operate on the entire catalog. Provide at least one of category / kitchenLocation / slugs.",
      };
    }
    const matched = await previewMatchingItems(filter);
    if (matched.length === 0) {
      return {
        success: true as const,
        preview: { matched: 0, summary: { count: 0, examples: [] } },
        confirmRequired: false as const,
      };
    }
    const matchedSlugs = matched.map((m) => m.slug);
    const cappedAt500 = matched.length >= 500;
    if (!input.confirm) {
      const summary = await summarizeForPreview(matched);
      return {
        success: true as const,
        preview: {
          matched: matched.length,
          cappedAt500,
          available: input.available,
          reason: input.reason ?? null,
          unavailableUntil: input.unavailableUntil ?? null,
          summary,
          slugs: matchedSlugs,
        },
        confirmRequired: true as const,
      };
    }
    // Pin the update to the exact slugs surfaced in the preview so the
    // commit can never silently drift to a different set.
    const result = await bulkSetAvailability(
      { slugs: matchedSlugs },
      input.available,
      input.reason ?? null,
      input.unavailableUntil ? new Date(input.unavailableUntil) : null,
    );
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "cms_bulk_availability",
      params: input,
      beforeState: { matched: result.matched },
      afterState: {
        updated: result.updated.length,
        slugs: result.updated.map((u) => u.slug),
      },
      status: "success",
      reasoning: input.reasoning,
    });
    return {
      success: true as const,
      matched: result.matched,
      updated: result.updated.length,
      slugs: result.updated.map((u) => u.slug),
    };
  },
});

registerAgent({
  name: "cms",
  description:
    "Catalog editor agent for menu items: create, update price, toggle availability (single + bulk), set image URL.",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 6,
  systemPrompt: CMS_PROMPT,
  tools: [
    listItems,
    createItem,
    updatePriceTool,
    toggleAvailability,
    uploadImage,
    bulkToggle,
  ],
});
