// Magnific + OpenRouter routing helpers. Models in `model_costs.model_id` use:
//   "openrouter/<provider>/<model>"      → routed via OpenRouter (server-side)
//   "magnific-image/<endpoint-slug>"     → Magnific text-to-image (server-side)
//   "magnific-video/<endpoint-slug>"     → Magnific video gen (server-side)
//   "magnific-music/<endpoint-slug>"     → Magnific music/audio (server-side)

export const OPENROUTER_PREFIX = "openrouter/";
export const MAGIC_HOUR_IMAGE_PREFIX = "magic-hour-image/";
export const MAGIC_HOUR_VIDEO_PREFIX = "magic-hour-video/";
export const MAGIC_HOUR_AUDIO_PREFIX = "magic-hour-audio/";

export const isOpenRouterModel = (id: string) => id.startsWith(OPENROUTER_PREFIX);
export const isMagicHourImage = (id: string) => id.startsWith(MAGIC_HOUR_IMAGE_PREFIX);
export const isMagicHourVideo = (id: string) => id.startsWith(MAGIC_HOUR_VIDEO_PREFIX);
export const isMagicHourAudio = (id: string) => id.startsWith(MAGIC_HOUR_AUDIO_PREFIX);
export const isMagicHourModel = (id: string) =>
  isMagicHourImage(id) || isMagicHourVideo(id) || isMagicHourAudio(id);

export const magicHourKind = (id: string): 'image' | 'video' | 'audio' | null => {
  if (isMagicHourImage(id)) return 'image';
  if (isMagicHourVideo(id)) return 'video';
  if (isMagicHourAudio(id)) return 'audio';
  return null;
};

// Built-in image models. gemini-2.5-flash-image uses Crossatrix API;
// gemini-3-pro-image-preview and gemini-3.1-flash-image-preview use Lovable AI Gateway.
export const BUILTIN_IMAGE_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
] as const;

export const isMediaModel = (id: string) =>
  isMagicHourModel(id) || (BUILTIN_IMAGE_MODELS as readonly string[]).includes(id);

export const openRouterModelName = (id: string) => id.slice(OPENROUTER_PREFIX.length);
