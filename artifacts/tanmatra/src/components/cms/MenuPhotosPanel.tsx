import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MenuItemRow {
  slug: string;
  name: string;
  imageUrl?: string | null;
}

interface Asset {
  id: number;
  slug: string;
  kind: "original" | "enhanced" | "hero" | "nobg";
  publicUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  isAiGenerated: number;
  provenance: {
    source?: string;
    model?: string;
    pipeline?: string[];
    prompt?: string;
  } | null;
  createdAt: string;
}

const KIND_LABEL: Record<Asset["kind"], string> = {
  original: "Original",
  enhanced: "Enhanced",
  hero: "AI Hero",
  nobg: "No BG",
};

const KIND_VARIANT: Record<
  Asset["kind"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  original: "outline",
  enhanced: "secondary",
  hero: "default",
  nobg: "secondary",
};

async function authedFetch(
  url: string,
  init: RequestInit,
  adminToken: string,
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (adminToken) headers["x-admin-token"] = adminToken;
  return fetch(url, { ...init, credentials: "include", headers });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result ?? "");
      const idx = str.indexOf(",");
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function MenuPhotosPanel({
  items,
  adminToken,
  onPrimaryChanged,
}: {
  items: MenuItemRow[];
  adminToken: string;
  onPrimaryChanged?: () => void;
}) {
  const [slug, setSlug] = useState<string>(items[0]?.slug ?? "");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState("");

  useEffect(() => {
    if (!slug && items[0]) setSlug(items[0].slug);
  }, [items, slug]);

  const load = async (s: string) => {
    if (!s) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(s)}/assets`,
        { method: "GET" },
        adminToken,
      );
      if (res.status === 403) {
        setError("Catalog scope required — set an admin token above.");
        setAssets([]);
        return;
      }
      const json = (await res.json()) as { assets?: Asset[] };
      setAssets(json.assets ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, adminToken]);

  const onUpload = async (file: File) => {
    if (!slug) return;
    if (!file.type.startsWith("image/")) {
      setError("only image files");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("file larger than 10MB");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(slug)}/assets/upload`,
        {
          method: "POST",
          body: JSON.stringify({ dataBase64, mimeType: file.type }),
        },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generateHero = async () => {
    setBusy("hero");
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(slug)}/assets/hero`,
        {
          method: "POST",
          body: JSON.stringify(extra ? { extraInstructions: extra } : {}),
        },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const enhance = async (id: number) => {
    setBusy(`enh-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/enhance`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeBg = async (id: number) => {
    setBusy(`bg-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/remove-bg`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setPrimary = async (id: number) => {
    setBusy(`pri-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/set-primary`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      onPrimaryChanged?.();
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeAsset = async (id: number) => {
    if (!window.confirm("Delete this derivative? Originals can't be deleted."))
      return;
    setBusy(`del-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}`,
        { method: "DELETE" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const currentItem = items.find((it) => it.slug === slug);
  const primaryUrl = currentItem?.imageUrl ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="flex-1 min-w-[200px] border rounded-md px-2 py-1 text-sm bg-background"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            <option value="">Select an item…</option>
            {items.map((it) => (
              <option key={it.slug} value={it.slug}>
                {it.name} ({it.slug})
              </option>
            ))}
          </select>
          <label className="text-xs">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={!slug || !!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <span className="inline-block">
              <Button
                size="sm"
                variant="outline"
                disabled={!slug || !!busy}
                asChild
              >
                <span>{busy === "upload" ? "Uploading…" : "Upload"}</span>
              </Button>
            </span>
          </label>
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="flex-1 border rounded-md px-2 py-1 text-xs bg-background"
            placeholder="Optional extra hero prompt (e.g. 'with mint garnish, wooden spoon')"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            disabled={!slug || !!busy}
          />
          <Button
            size="sm"
            disabled={!slug || !!busy}
            onClick={() => void generateHero()}
          >
            {busy === "hero" ? "Generating…" : "Generate AI hero"}
          </Button>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : assets.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No photos yet. Upload one or generate an AI hero.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {assets.map((a) => {
              const isPrimary = primaryUrl === a.publicUrl;
              return (
                <div
                  key={a.id}
                  className={`border rounded-md p-2 space-y-1 text-xs ${
                    isPrimary ? "border-primary border-2" : ""
                  }`}
                >
                  <div className="aspect-[4/3] bg-muted rounded overflow-hidden flex items-center justify-center">
                    <img
                      src={a.publicUrl}
                      alt={`${a.kind} ${a.id}`}
                      className="object-cover w-full h-full"
                      style={
                        a.kind === "nobg"
                          ? {
                              background:
                                "repeating-conic-gradient(#e5e5e5 0% 25%, #f5f5f5 0% 50%) 50%/16px 16px",
                              objectFit: "contain",
                            }
                          : undefined
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <Badge variant={KIND_VARIANT[a.kind]}>
                      {KIND_LABEL[a.kind]}
                    </Badge>
                    {a.isAiGenerated === 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        AI
                      </Badge>
                    )}
                    {isPrimary && (
                      <Badge className="text-[10px]">Primary</Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                  {a.provenance?.model && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      model: {a.provenance.model}
                    </div>
                  )}
                  {a.provenance?.pipeline &&
                    a.provenance.pipeline.length > 0 && (
                      <div
                        className="text-[10px] text-muted-foreground truncate"
                        title={a.provenance.pipeline.join(" → ")}
                      >
                        steps: {a.provenance.pipeline.length}
                      </div>
                    )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {!isPrimary && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void setPrimary(a.id)}
                      >
                        Set primary
                      </Button>
                    )}
                    {a.kind === "original" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void enhance(a.id)}
                      >
                        {busy === `enh-${a.id}` ? "…" : "Re-enhance"}
                      </Button>
                    )}
                    {a.kind !== "nobg" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void removeBg(a.id)}
                      >
                        {busy === `bg-${a.id}` ? "…" : "Remove BG"}
                      </Button>
                    )}
                    {a.kind !== "original" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-destructive"
                        disabled={!!busy}
                        onClick={() => void removeAsset(a.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
