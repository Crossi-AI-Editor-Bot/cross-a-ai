-- Remove unique constraint on model_id to allow multiple entries with same model_id
ALTER TABLE public.model_costs DROP CONSTRAINT IF EXISTS model_costs_model_id_key;

-- Add index on model_id for performance (non-unique)
CREATE INDEX IF NOT EXISTS idx_model_costs_model_id ON public.model_costs(model_id);