## Goal

Replace Magnific with Magic Hour, split media credits into 3 separate pools (Image / Video / Audio), and add an 8-key rotation system with a failover queue.

---

## 1. Database changes

**New tables**
- `magic_hour_keys` — `id, secret_name (MH1..MH8), category ('video'|'image'|'audio'|null), enabled bool, last_402_at timestamptz, created_at`. Seeded with MH1–MH8; MH1–3=video, MH4–5=image, MH6–7=audio, MH8=null.
- `generation_queue` (replace existing) — `id, user_id, conversation_id, model_cost_id, kind ('image'|'video'|'audio'), prompt, image_input text?, duration int?, status ('queued'|'processing'|'done'|'failed'), result_url text?, error text?, position bigserial, last_attempt_at, created_at, updated_at`. RLS: user sees own; service role manages.

**`vip_tiers` new columns**
- `weekly_audio_credits int default 10`
- `monthly_video_credits int default 5`
- (existing `weekly_image_credits` kept; `default_audio_credits` / `default_video_credits` deprecated/dropped)

**New `free_tier_defaults` row** — store free-user defaults in `site_settings` under key `free_tier_defaults` (jsonb: `{ daily_credits, weekly_image, weekly_audio, monthly_video }`) so admins edit them in the new "Free Users" tab without a tier row.

**`user_video_credits` rework** — repurpose existing table; add `monthly` reset semantics. `user_audio_credits` already exists with weekly semantics — align RLS so service role can update, user can view/insert.

**`model_costs` new columns**
- `audio_cost numeric default 0`
- `video_cost numeric default 0`
- `kind text` ('image'|'video'|'audio'|'text') derived for Magic Hour models
- Existing `image_cost`, `video_credits_per_second`, `audio_credits_per_second` stay; admins set per-second rates for video/audio in the model editor.

**Delete all rows where `model_id` starts with `magnific-*`** (and their tier-access rows).

**RPC functions**
- `reset_weekly_audio_credits(p_user_id)` — fix existing to use new `weekly_audio_credits` (from VIP tier or free defaults).
- `reset_monthly_video_credits(p_user_id)` — fix to use `monthly_video_credits`.
- `reset_weekly_image_credits` — already exists; align with `weekly_image_credits` or free defaults.

**GRANTs + RLS** on every new public table per project rules.

---

## 2. Edge functions

**Delete:** `supabase/functions/magnific-generate/`

**New:** `supabase/functions/magic-hour-generate/`
- Input: `{ modelCostId, prompt, kind, image?, duration? }`
- Validates auth, tier access, fake-model handling (kept from current logic), unlimited bypass.
- Looks up the right credit pool by `kind`:
  - image → `user_image_credits` deducted by `image_cost`
  - audio → `user_audio_credits` deducted by `audio_cost` or `duration * audio_credits_per_second`
  - video → `user_video_credits` deducted by `duration * video_credits_per_second`
- Fetches enabled keys for the model's category from `magic_hour_keys`, ordered randomly.
- For each key in order: call Magic Hour endpoint with that key's secret. If response is **402** → mark `last_402_at = now()`, skip to next key (NO error to user). Any other failure → refund + return error.
- If **all keys 402** → respond `{ status: 'queue_offer' }` (no deduction yet).
- On success → deduct credits, return result.

**New:** `supabase/functions/queue-join/`
- Input: `{ modelCostId, prompt, kind, image?, duration? }`. Inserts queued row for the user.

**New:** `supabase/functions/queue-worker/` (cron, every 3 min via `pg_cron` + `pg_net`)
- For each `kind`, fetch position-1 queued items per user-FIFO globally.
- Try Magic Hour with any enabled key in that category. If any non-402 success → deduct credits, write a new assistant message into the user's conversation containing the result (image/video/audio data URL), mark queue row `done`. If all 402 → leave queued, update `last_attempt_at`.

**Update:** `supabase/functions/chat/index.ts` — for Magic Hour media models, route through the new function; remove magnific references.

**Update:** `supabase/functions/deduct-image-credits/index.ts` — still image-only (Puter.js path).

**Restart:** `supabase/config.toml` add `[functions.magic-hour-generate]`, `[functions.queue-join]`, `[functions.queue-worker]` (`verify_jwt = false`).

---

## 3. Magic Hour integration

Auto-seed all Magic Hour free-plan endpoints into `model_costs` (image: text-to-image; video: text-to-video + video-extend; audio: text-to-speech + music-generation). Each gets a `model_id` like `magic-hour-image/<endpoint>`, `magic-hour-video/<endpoint>`, `magic-hour-audio/<endpoint>`.

Update `src/lib/externalModels.ts`: add `MAGIC_HOUR_*_PREFIX` helpers, remove magnific helpers. `isMediaModel` updated.

---

## 4. Frontend

**`CreditsDisplay`** — now shows 3 separate pills when the selected model is media:
- Image (purple/pink, current style)
- Video (light blue: `text-sky-300`, border `sky-500/30`)
- Audio (orange: `text-orange-300`, border `orange-500/30`)
Switches which pill is shown based on selected model `kind`.

**New hooks** `useVideoCredits`, `useAudioCredits` (mirroring `useImageCredits`).

**`useChat` / media send flow** — on `queue_offer` response, show confirm dialog: "All generation slots are busy. Join the queue? You'll get the result in chat when ready." On confirm calls `queue-join`. Show a small "In queue (#N)" badge in the chat.

**Realtime** — subscribe to `generation_queue` updates for user to flip badge → posted result.

**Admin Panel**
- **VipTierManager**: add per-tier inputs for `weekly_image_credits` (already there), `weekly_audio_credits`, `monthly_video_credits`.
- **New tab "Free Users"** in VipTierManager: edits the `free_tier_defaults` site_settings row.
- **New `MagicHourKeyManager` component**: lists MH1–MH8, toggle enabled, dropdown category (Video/Image/Audio/Unassigned), shows last-402 timestamp.
- **FileEditor (model)**: show fields appropriate to `kind` — image_cost for image, video_credits_per_second for video, audio_credits_per_second for audio.

---

## 5. Cleanup

- Remove `src/lib/externalModels.ts` magnific code paths.
- Drop `MAGNIFIC_KEY` secret usage (keep the secret itself; user can delete in settings).
- Remove unused VEO/replicate paths if any tie to magnific (verify).

---

## Technical notes

- The 3-minute retry interval is implemented via `pg_cron` running `queue-worker` every 3 min — workers process one item per user per run for fairness.
- 402 = "free quota exhausted" on Magic Hour; we treat it as silent and try next key. Any 4xx/5xx other than 402 = real error → refund + show.
- All MH secrets (`MH1`..`MH8`) already exist in project secrets and are read by the edge function via `Deno.env.get(row.secret_name)`.
- Existing `generation_queue` table is replaced (it has no useful data flow yet — only SELECT policy).
- New rows in `model_costs` for Magic Hour will get tier-access rows via the existing `auto_create_model_tier_access` trigger.

