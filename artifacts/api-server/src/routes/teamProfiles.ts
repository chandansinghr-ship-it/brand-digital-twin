import { Router, type IRouter, type Request, type Response } from "express";
import {
  getTeamProfileBySlug,
  listTeamProfiles,
} from "../lib/teamProfiles";
import { DISHES } from "@workspace/menu-catalog";

const router: IRouter = Router();

router.get("/team-profiles", async (req: Request, res: Response) => {
  const role = req.query["role"] ? String(req.query["role"]) : undefined;
  const profiles = await listTeamProfiles(role);
  res.json({ profiles });
});

router.get("/team-profiles/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params["slug"] ?? "");
  const profile = await getTeamProfileBySlug(slug);
  if (!profile) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const ownedDishSlugs: string[] = [];
  if (profile.role === "chef") {
    const kitchens = (profile.kitchens ?? []) as string[];
    for (const d of DISHES) {
      if (!d.isAvailable) continue;
      if (kitchens.includes(d.kitchen)) ownedDishSlugs.push(d.slug);
      if (ownedDishSlugs.length >= 8) break;
    }
  } else if (profile.role === "rd") {
    // Map RDs to dishes via the same heuristic the storefront uses
    // (see artifacts/tanmatra/src/lib/teamData.ts#getRdForDish).
    for (const d of DISHES) {
      if (!d.isAvailable) continue;
      const sugarNum = parseFloat(d.sugarPerServing) || 0;
      let matchedSlug: string | null = null;
      if (d.macros.protein >= 22) {
        matchedSlug = "rd-vikram-sethi";
      } else if (d.glycaemicIndex === "low" && sugarNum <= 10 && d.macros.fat <= 18) {
        matchedSlug = "rd-anjali-nair";
      } else {
        matchedSlug = "rd-kavya-menon";
      }
      if (matchedSlug === profile.slug) ownedDishSlugs.push(d.slug);
      if (ownedDishSlugs.length >= 8) break;
    }
  }
  res.json({ profile, ownedDishSlugs });
});

export default router;
