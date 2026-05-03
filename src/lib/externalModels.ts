// Magnific + OpenRouter routing helpers. Models in `model_costs.model_id` use:
//   "openrouter/<provider>/<model>"      → routed via OpenRouter (server-side)
//   "magnific-image/<endpoint-slug>"     → Magnific text-to-image (server-side)
//   "magnific-video/<endpoint-slug>"     → Magnific video gen (server-side)
//   "magnific-music/<endpoint-slug>"     → Magnific music/audio (server-side)

export const OPENROUTER_PREFIX = "openrouter/";
export const MAGNIFIC_IMAGE_PREFIX = "magnific-image/";
export const MAGNIFIC_VIDEO_PREFIX = "magnific-video/";
export const MAGNIFIC_MUSIC_PREFIX = "magnific-music/";

export const isOpenRouterModel = (id: string) => id.startsWith(OPENROUTER_PREFIX);
export const isMagnificImageModel = (id: string) => id.startsWith(MAGNIFIC_IMAGE_PREFIX);
export const isMagnificVideoModel = (id: string) => id.startsWith(MAGNIFIC_VIDEO_PREFIX);
export const isMagnificMusicModel = (id: string) => id.startsWith(MAGNIFIC_MUSIC_PREFIX);
export const isMagnificModel = (id: string) =>
  isMagnificImageModel(id) || isMagnificVideoModel(id) || isMagnificMusicModel(id);

export const openRouterModelName = (id: string) => id.slice(OPENROUTER_PREFIX.length);
export const magnificEndpointSlug = (id: string): string => {
  if (isMagnificImageModel(id)) return id.slice(MAGNIFIC_IMAGE_PREFIX.length);
  if (isMagnificVideoModel(id)) return id.slice(MAGNIFIC_VIDEO_PREFIX.length);
  if (isMagnificMusicModel(id)) return id.slice(MAGNIFIC_MUSIC_PREFIX.length);
  return id;
};

export const MAGNIFIC_IMAGE_ENDPOINTS: { slug: string; label: string }[] = [
  { slug: "imagen4-fast", label: "Imagen 4 Fast" },
  { slug: "imagen4-ultra", label: "Imagen 4 Ultra" },
  { slug: "nano-banana-pro", label: "Nano Banana Pro" },
  { slug: "nano-banana-pro-flash", label: "Nano Banana Pro Flash" },
  { slug: "seedream-4", label: "Seedream 4" },
  { slug: "seedream-v4-5", label: "Seedream 4.5" },
  { slug: "flux-2-pro", label: "Flux 2 Pro" },
  { slug: "flux-2-turbo", label: "Flux 2 Turbo" },
  { slug: "flux-pro-v1-1", label: "Flux Pro 1.1" },
  { slug: "hyperflux", label: "Hyperflux" },
  { slug: "z-image-turbo", label: "Z-Image Turbo" },
  { slug: "mystic", label: "Mystic" },
];

export const MAGNIFIC_VIDEO_ENDPOINTS: { slug: string; label: string }[] = [
  { slug: "image-to-video/kling-elements-std", label: "Kling Elements Std" },
  { slug: "image-to-video/kling-v2-1-pro", label: "Kling 2.1 Pro" },
  { slug: "image-to-video/kling-v2-5-pro", label: "Kling 2.5 Pro" },
  { slug: "image-to-video/kling-v2-6-pro", label: "Kling 2.6 Pro" },
  { slug: "image-to-video/minimax-hailuo-02-1080p", label: "Hailuo 02 1080p" },
  { slug: "image-to-video/runway-gen4-turbo", label: "RunWay Gen4 Turbo" },
  { slug: "image-to-video/seedance-pro-1080p", label: "Seedance Pro" },
  { slug: "text-to-video/wan-2-5-t2v-1080p", label: "WAN 2.5 T2V 1080p" },
  { slug: "text-to-video/ltx-2-pro", label: "LTX 2.0 Pro" },
];

export const MAGNIFIC_MUSIC_ENDPOINTS: { slug: string; label: string }[] = [
  { slug: "music-generation", label: "Music Generation" },
  { slug: "sound-effects", label: "Sound Effects" },
];
