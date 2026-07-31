-- Add a short description field for models, shown under the model name
-- in the model selector UI.
ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS description text;
