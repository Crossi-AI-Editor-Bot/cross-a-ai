
-- Create junction table for dynamic model-tier access
CREATE TABLE public.model_tier_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_cost_id UUID NOT NULL REFERENCES public.model_costs(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL,
  has_access BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(model_cost_id, tier_name)
);

-- Enable RLS
ALTER TABLE public.model_tier_access ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view model tier access"
  ON public.model_tier_access FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert model tier access"
  ON public.model_tier_access FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update model tier access"
  ON public.model_tier_access FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete model tier access"
  ON public.model_tier_access FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing data from hardcoded columns
INSERT INTO public.model_tier_access (model_cost_id, tier_name, has_access)
SELECT id, 'copper', copper_access FROM public.model_costs
UNION ALL
SELECT id, 'bronze', bronze_access FROM public.model_costs
UNION ALL
SELECT id, 'silver', silver_access FROM public.model_costs
UNION ALL
SELECT id, 'gold', gold_access FROM public.model_costs
UNION ALL
SELECT id, 'platinum', platinum_access FROM public.model_costs
UNION ALL
SELECT id, 'diamond', diamond_access FROM public.model_costs;

-- Trigger: auto-create access entries for ALL existing models when a new tier is added
CREATE OR REPLACE FUNCTION public.auto_create_tier_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.model_tier_access (model_cost_id, tier_name, has_access)
  SELECT id, NEW.name, true FROM public.model_costs;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_vip_tier_created
  AFTER INSERT ON public.vip_tiers
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_tier_access();

-- Trigger: auto-create access entries for ALL existing tiers when a new model is added
CREATE OR REPLACE FUNCTION public.auto_create_model_tier_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.model_tier_access (model_cost_id, tier_name, has_access)
  SELECT NEW.id, name, true FROM public.vip_tiers;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_model_cost_created
  AFTER INSERT ON public.model_costs
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_model_tier_access();

-- Trigger: clean up access entries when a tier is deleted
CREATE OR REPLACE FUNCTION public.auto_delete_tier_access()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.model_tier_access WHERE tier_name = OLD.name;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_vip_tier_deleted
  AFTER DELETE ON public.vip_tiers
  FOR EACH ROW EXECUTE FUNCTION public.auto_delete_tier_access();

-- Enable realtime for model_tier_access
ALTER PUBLICATION supabase_realtime ADD TABLE public.model_tier_access;
