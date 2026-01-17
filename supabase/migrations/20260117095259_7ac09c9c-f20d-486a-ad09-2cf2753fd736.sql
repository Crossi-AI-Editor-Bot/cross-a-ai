-- Add copper_access and platinum_access columns to model_costs table
ALTER TABLE public.model_costs
ADD COLUMN copper_access boolean NOT NULL DEFAULT true,
ADD COLUMN platinum_access boolean NOT NULL DEFAULT true;