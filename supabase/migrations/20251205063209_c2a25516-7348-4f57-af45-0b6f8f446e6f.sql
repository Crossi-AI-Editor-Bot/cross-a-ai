-- Add enabled and vip_only columns to model_costs table
ALTER TABLE public.model_costs 
ADD COLUMN enabled boolean NOT NULL DEFAULT true,
ADD COLUMN vip_only boolean NOT NULL DEFAULT false;