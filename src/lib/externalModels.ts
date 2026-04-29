// Shared constants for external model providers (OpenRouter text + Puter.js images).
// Models are identified in `model_costs.model_id` by a provider prefix:
//   - "openrouter/<provider>/<model>"  → routed via OpenRouter (server-side)
//   - "puter/<model-id>"               → routed via Puter.js (client-side)

export const OPENROUTER_PREFIX = "openrouter/";
export const PUTER_PREFIX = "puter/";

export const isOpenRouterModel = (modelId: string) =>
  modelId.startsWith(OPENROUTER_PREFIX);

export const isPuterImageModel = (modelId: string) =>
  modelId.startsWith(PUTER_PREFIX);

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
      ai: {
        txt2img: (
          prompt: string,
          options?: { model?: string; quality?: "low" | "medium" | "high" | "hd" }
        ) => Promise<HTMLImageElement>;
      };
    };
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
  if (typeof window === "undefined" || !window.puter?.ai?.txt2img) {
    throw new Error("Puter.js is not loaded. Please refresh the page and try again.");
  }

  const model = puterModelName(modelId);
  const img = await window.puter.ai.txt2img(prompt, { model });

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