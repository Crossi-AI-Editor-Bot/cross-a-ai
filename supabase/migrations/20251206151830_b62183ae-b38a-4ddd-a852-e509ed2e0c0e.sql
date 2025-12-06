-- Add folder column to model_costs table
ALTER TABLE public.model_costs ADD COLUMN folder text DEFAULT NULL;

-- Create index for folder queries
CREATE INDEX idx_model_costs_folder ON public.model_costs(folder);