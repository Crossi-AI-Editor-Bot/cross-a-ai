// Uploads generated media to the user's Crossi Cloud in a "Crossi AI" folder.
// Best-effort: never throws, failures are only logged.
const BASE = "https://crossicloud.lovable.app/api/public/v1";
const FOLDER_NAME = "Crossi AI";

function headers(crossatrixId: string, token: string): Record<string, string> {
  return {
    "X-API-Key": Deno.env.get("CROSSICLOUD_API_KEY") ?? "",
    "X-Crossatrix-User-Id": crossatrixId,
    Authorization: `Bearer ${token}`,
  };
}

function tokenExpired(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof p.exp === "number" && p.exp * 1000 < Date.now();
  } catch { return false; }
}

// The API only documents listing (no folder creation), so use an existing "Crossi AI" root folder if present.
async function getFolderId(cxId: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/files`, { headers: headers(cxId, token) });
    if (!r.ok) { console.error("crossicloud list failed", r.status, (await r.text()).slice(0, 200)); return null; }
    const j = await r.json().catch(() => ({}));
    const f = (j.files ?? []).find((x: any) => x?.is_folder && x?.name === FOLDER_NAME);
    return f?.id ? String(f.id) : null;
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
): Promise<void> {
  try {
    if (!Deno.env.get("CROSSICLOUD_API_KEY")) return;
    const { data: profile } = await service.from("profiles").select("crossatrix_id").eq("user_id", userId).maybeSingle();
    const cxId = profile?.crossatrix_id;
    if (!cxId) { console.log("crossicloud skip: no crossatrix id"); return; }
    const { data: conn } = await service.from("user_connectors").select("access_token")
      .eq("user_id", userId).eq("provider", "crossatrix").maybeSingle();
    const token: string | undefined = conn?.access_token;
    if (!token) { console.log("crossicloud skip: no crossatrix token (user must log in again)"); return; }
    if (tokenExpired(token)) { console.log("crossicloud skip: crossatrix token expired"); return; }

    let blob: Blob;
    const m = source.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: m[1] });
    } else {
      blob = await (await fetch(source)).blob();
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
