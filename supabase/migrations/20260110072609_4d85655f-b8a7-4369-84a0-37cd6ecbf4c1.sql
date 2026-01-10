-- Add system_prompt column to model_costs table
ALTER TABLE public.model_costs
ADD COLUMN system_prompt text DEFAULT NULL;

-- Add RLS policy for admins to delete models
CREATE POLICY "Admins can delete model costs"
ON public.model_costs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));