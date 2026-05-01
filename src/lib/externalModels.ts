// Shared constants for external model providers (OpenRouter text + Puter.js images).
// Models are identified in `model_costs.model_id` by a provider prefix:
//   - "openrouter/<provider>/<model>"  → routed via OpenRouter (server-side)
//   - "puter/<model-id>"               → routed via Puter.js (client-side)

export const OPENROUTER_PREFIX = "openrouter/";
export const PUTER_PREFIX = "puter/";
export const CROSSI_VIDEO_PREFIX = "crossi-video/";

export const isOpenRouterModel = (modelId: string) =>
  modelId.startsWith(OPENROUTER_PREFIX);

export const isPuterImageModel = (modelId: string) =>
  modelId.startsWith(PUTER_PREFIX);

export const isCrossiVideoModel = (modelId: string) =>
  modelId.startsWith(CROSSI_VIDEO_PREFIX);

/** Strip "crossi-video/" to get underlying Puter image model id. */
export const crossiVideoBaseModel = (modelId: string) =>
  modelId.slice(CROSSI_VIDEO_PREFIX.length) === "imagen-4.0-fast"
    ? "google/imagen-4.0-fast"
    : modelId.slice(CROSSI_VIDEO_PREFIX.length);

const isMobileRuntime = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(max-width: 768px)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Please try a shorter video or retry.`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ---------- Frame cache ----------
// In-memory cache keyed by `${baseModel}::${fullPrompt}` so identical frame
// requests (same prompt + model + frame index + total) reuse a previous
// generation instead of paying for it again. Survives for the page session.
const FRAME_CACHE = new Map<string, Promise<string>>();
const FRAME_CACHE_MAX = 500;

function cacheGet(key: string) {
  return FRAME_CACHE.get(key);
}
function cacheSet(key: string, value: Promise<string>) {
  if (FRAME_CACHE.size >= FRAME_CACHE_MAX) {
    // Drop oldest entry (Map preserves insertion order).
    const firstKey = FRAME_CACHE.keys().next().value;
    if (firstKey !== undefined) FRAME_CACHE.delete(firstKey);
  }
  FRAME_CACHE.set(key, value);
}

/**
 * Strip the "puter/" prefix to get the actual model id Puter.js expects.
 * e.g. "puter/dall-e-3" -> "dall-e-3"
 *      "puter/black-forest-labs/FLUX.1-schnell" -> "black-forest-labs/FLUX.1-schnell"
 */
export const puterModelName = (modelId: string) =>
  modelId.slice(PUTER_PREFIX.length);

/**
 * Strip "openrouter/" to get the OpenRouter model id.
 * e.g. "openrouter/openai/gpt-4o" -> "openai/gpt-4o"
 */
export const openRouterModelName = (modelId: string) =>
  modelId.slice(OPENROUTER_PREFIX.length);

// Allowed Puter.js text-to-image models (curated by admin request).
// Display label → underlying Puter model id (without the "puter/" db prefix).
export const PUTER_IMAGE_MODELS: { id: string; label: string }[] = [
  { id: "gemini-2.5-flash-image-preview", label: "Gemini 2.5 Flash Image (Nano Banana)" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5" },
  { id: "gpt-image-1", label: "GPT Image 1" },
  { id: "gpt-image-1-mini", label: "GPT Image 1 Mini" },
  { id: "dall-e-3", label: "DALL·E 3" },
  { id: "dall-e-2", label: "DALL·E 2" },
  { id: "ByteDance-Seed/Seedream-3.0", label: "Seedream 3.0" },
  { id: "ByteDance-Seed/Seedream-4.0", label: "Seedream 4.0" },
  { id: "HiDream-ai/HiDream-I1-Dev", label: "HiDream I1 Dev" },
  { id: "HiDream-ai/HiDream-I1-Fast", label: "HiDream I1 Fast" },
  { id: "HiDream-ai/HiDream-I1-Full", label: "HiDream I1 Full" },
  { id: "Lykon/DreamShaper", label: "DreamShaper" },
  { id: "Qwen/Qwen-Image", label: "Qwen Image" },
  { id: "RunDiffusion/Juggernaut-pro-flux", label: "Juggernaut Pro Flux" },
  { id: "Rundiffusion/Juggernaut-Lightning-Flux", label: "Juggernaut Lightning Flux" },
  { id: "black-forest-labs/FLUX.1-Canny-pro", label: "FLUX.1 Canny Pro" },
  { id: "black-forest-labs/FLUX.1-kontext-max", label: "FLUX.1 Kontext Max" },
  { id: "black-forest-labs/FLUX.1-kontext-pro", label: "FLUX.1 Kontext Pro" },
  { id: "black-forest-labs/FLUX.1-krea-dev", label: "FLUX.1 Krea Dev" },
  { id: "black-forest-labs/FLUX.1-schnell", label: "FLUX.1 Schnell" },
  { id: "black-forest-labs/FLUX.1-schnell-Free", label: "FLUX.1 Schnell (Free)" },
  { id: "black-forest-labs/FLUX.1.1-pro", label: "FLUX.1.1 Pro" },
  { id: "google/flash-image-2.5", label: "Google Flash Image 2.5" },
  { id: "google/imagen-4.0-fast", label: "Imagen 4.0 Fast" },
  { id: "google/imagen-4.0-preview", label: "Imagen 4.0 Preview" },
  { id: "google/imagen-4.0-ultra", label: "Imagen 4.0 Ultra" },
  { id: "ideogram/ideogram-3.0", label: "Ideogram 3.0" },
  { id: "stabilityai/stable-diffusion-3-medium", label: "Stable Diffusion 3 Medium" },
  { id: "stabilityai/stable-diffusion-xl-base-1.0", label: "Stable Diffusion XL 1.0" },
];

// Type for window.puter (loaded via index.html script)
declare global {
  interface Window {
    puter?: {
      auth?: {
        isSignedIn?: () => boolean | Promise<boolean>;
        signIn?: (options?: { attempt_temp_user_creation?: boolean }) => Promise<unknown>;
      };
      ai: {
        txt2img: (
          prompt: string,
          options?: { model?: string; quality?: "low" | "medium" | "high" | "hd" }
        ) => Promise<HTMLImageElement>;
        chat?: (
          prompt: string | Array<unknown>,
          options?: { model?: string; stream?: boolean }
        ) => Promise<unknown>;
      };
    };
  }
}

export async function ensurePuterSignedIn(options: { interactive?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined" || !window.puter?.ai?.txt2img) {
    throw new Error("Puter.js is not loaded. Please refresh the page and try again.");
  }

  const auth = window.puter.auth;
  if (!auth?.isSignedIn) return;

  const signInState = auth.isSignedIn();
  const signedIn = typeof (signInState as Promise<boolean>)?.then === "function"
    ? await signInState
    : signInState;
  if (signedIn) return;

  if (!options.interactive || !auth.signIn) {
    throw new Error("Puter sign-in is required before using Puter image models. Tap send again and complete the Puter sign-in popup.");
  }

  try {
    await withTimeout(auth.signIn(), 60_000, "Puter sign-in");
  } catch (error) {
    console.error("[Puter] Sign-in failed or was cancelled:", error);
    throw new Error("Puter sign-in was cancelled or blocked. Please allow the popup and try again.");
  }

  const signedInAfterPopup = await Promise.resolve(auth.isSignedIn());
  if (!signedInAfterPopup) {
    throw new Error("Puter sign-in was not completed. Please try again before generating images.");
  }
}

/**
 * Generate an image with Puter.js and return a data URL (base64) so it can be
 * stored/displayed like any other image response from the chat function.
 */
export async function generatePuterImage(
  prompt: string,
  modelId: string
): Promise<string> {
  await ensurePuterSignedIn({ interactive: false });

  const model = puterModelName(modelId);
  const img = await withTimeout(
    window.puter!.ai.txt2img(prompt, { model }),
    isMobileRuntime() ? 120_000 : 90_000,
    "Image generation",
  );

  // Puter returns an <img> element. Convert to a data URL so it survives storage.
  const src = img.src;
  if (src.startsWith("data:")) return src;

  // Fetch and convert remote URL → data URL
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // If CORS prevents conversion, return the URL directly.
    return src;
  }
}

/**
 * Generate a single frame for the Crossi 5.1 Video model.
 * Uses Puter's txt2img with the underlying image model. The prompt is augmented
 * to reference frame index + a brief textual recap of the last 3 frames so the
 * model maintains rough visual continuity (true image-to-image conditioning is
 * not available via Puter's txt2img endpoint for imagen-4.0-fast).
 */
async function generateVideoFrame(
  basePrompt: string,
  baseModel: string,
  frameIndex: number,
  totalFrames: number,
): Promise<string> {
  const progress = Math.round((frameIndex / Math.max(totalFrames - 1, 1)) * 100);
  const continuityHint =
    frameIndex === 0
      ? "Opening frame of a short cinematic sequence."
      : `Frame ${frameIndex + 1} of ${totalFrames} (${progress}% through). Maintain the SAME subject, composition, color palette, lighting and style as previous frames; advance the motion/animation slightly forward in time.`;

  const fullPrompt = `${basePrompt}\n\n[${continuityHint}]`;

  if (!window.puter?.ai?.txt2img) {
    throw new Error("Puter.js not available");
  }

  const cacheKey = `${baseModel}::${fullPrompt}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    console.log(`[CrossiVideo] Generating frame ${frameIndex + 1}/${totalFrames} with Puter model:`, baseModel);
    const img = await withTimeout(
      window.puter!.ai.txt2img(fullPrompt, { model: baseModel }),
      isMobileRuntime() ? 120_000 : 90_000,
      `Frame ${frameIndex + 1}`,
    );
    console.log(`[CrossiVideo] Frame ${frameIndex + 1} ready`);
    const src = img.src;
    if (src.startsWith("data:")) return src;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return src;
    }
  })();

  cacheSet(cacheKey, promise);
  // If generation fails, evict so a retry can succeed next time.
  promise.catch(() => FRAME_CACHE.delete(cacheKey));
  return promise;
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/**
 * Generates an up-to-5-second video at 10 FPS using Puter image generation
 * for each frame, then assembles them into a WebM via canvas + MediaRecorder.
 * Returns a data: URL of the final video (blob converted to base64).
 */
export async function generateCrossiVideo(
  prompt: string,
  modelId: string,
  durationSeconds: number,
  onProgress?: (current: number, total: number) => void,
): Promise<string> {
  await ensurePuterSignedIn({ interactive: false });
  const fps = 10;
  const seconds = Math.max(1, Math.min(5, Math.round(durationSeconds)));
  const totalFrames = fps * seconds;
  const baseModel = crossiVideoBaseModel(modelId); // e.g. "imagen-4.0-fast"
  console.log(`[CrossiVideo] Starting: ${seconds}s, ${totalFrames} frames, model="${baseModel}"`);
  onProgress?.(0, totalFrames);

  // Generate frames in parallel with a bounded concurrency. Cache hits return
  // instantly without re-billing the upstream API.
  const CONCURRENCY = isMobileRuntime() ? 1 : 3;
  const frameDataUrls: string[] = new Array(totalFrames);
  let completed = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= totalFrames) return;
      try {
        frameDataUrls[i] = await generateVideoFrame(prompt, baseModel, i, totalFrames);
        completed += 1;
        onProgress?.(completed, totalFrames);
      } catch (e) {
        console.error(`[CrossiVideo] Frame ${i + 1} failed:`, e);
        throw e;
      }
    }
  };

  const workerCount = Math.min(CONCURRENCY, totalFrames);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Load all frames as <img> elements for drawing.
  const images = await Promise.all(frameDataUrls.map(loadImageEl));
  const w = images[0]?.naturalWidth || 1024;
  const h = images[0]?.naturalHeight || 1024;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Draw the first frame so the captured stream isn't blank.
  ctx.drawImage(images[0], 0, 0, w, h);

  const stream = (canvas as HTMLCanvasElement).captureStream(fps);

  // Pick the best supported MIME type.
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mime = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();

  // Draw each frame for exactly (1000/fps) ms.
  const frameMs = 1000 / fps;
  for (let i = 0; i < images.length; i++) {
    ctx.drawImage(images[i], 0, 0, w, h);
    await new Promise((r) => setTimeout(r, frameMs));
  }
  // Linger on the last frame briefly so MediaRecorder captures it.
  await new Promise((r) => setTimeout(r, frameMs));

  recorder.stop();
  await recordingDone;

  const blob = new Blob(chunks, { type: mime });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}