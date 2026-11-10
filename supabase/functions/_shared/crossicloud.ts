// Uploads generated media to the user's Crossicloud in a "Crossi AI" folder.
// Best-effort: never throws, failures are only logged.
const BASE = "https://preview--crossicloud.lovable.app/api/public/v1";
const FOLDER_NAME = "Crossi AI";

function headers(crossatrixId: string, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "X-API-Key": Deno.env.get("CROSSICLOUD_API_KEY") ?? "",
    "X-Crossatrix-User-Id": crossatrixId,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function getFolderId(crossatrixId: string, token?: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/folders`, { headers: headers(crossatrixId, token) });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const list = Array.isArray(j) ? j : (j.folders ?? j.data ?? []);
      const f = list.find((x: any) => x?.name === FOLDER_NAME);
      if (f?.id) return String(f.id);
    }
    const c = await fetch(`${BASE}/folders`, {
      method: "POST",
      headers: { ...headers(crossatrixId, token), "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME }),
    });
    const cj = await c.json().catch(() => ({}));
    const id = cj?.id ?? cj?.folder?.id ?? cj?.data?.id;
    return id ? String(id) : null;
  } catch (e) {
    console.error("crossicloud folder error", e);
    return null;
  }
}

export async function uploadToCrossicloud(
  service: any,
  userId: string,
  source: string, // data URL or http URL
  kind: "image" | "video" | "audio",
  token?: string,
): Promise<void> {
  try {
    if (!Deno.env.get("CROSSICLOUD_API_KEY")) return;
    const { data: profile } = await service.from("profiles").select("crossatrix_id").eq("user_id", userId).maybeSingle();
    const cxId = profile?.crossatrix_id;
    if (!cxId) return;

    let blob: Blob;
    const m = source.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: m[1] });
    } else {
      const r = await fetch(source);
      blob = await r.blob();
    }
    const mime = blob.type || "";
    const ext = mime.split("/")[1]?.split(";")[0] || (kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3");
    const name = `crossi-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

    const form = new FormData();
    form.append("file", blob, name);
    const folderId = await getFolderId(cxId, token);
    if (folderId) form.append("folder_id", folderId);

    const res = await fetch(`${BASE}/files`, { method: "POST", headers: headers(cxId, token), body: form });
    if (!res.ok) console.error("crossicloud upload failed", res.status, (await res.text()).slice(0, 300));
  } catch (e) {
    console.error("crossicloud upload error", e);
  }
}
