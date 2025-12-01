-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create model_costs table
CREATE TABLE public.model_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  cost NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.model_costs ENABLE ROW LEVEL SECURITY;

-- RLS policies for model_costs
CREATE POLICY "Anyone can view model costs"
ON public.model_costs
FOR SELECT
USING (true);

CREATE POLICY "Admins can update model costs"
ON public.model_costs
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert model costs"
ON public.model_costs
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default model costs
INSERT INTO public.model_costs (model_id, label, cost) VALUES
  ('openai/gpt-5', 'Crossi 2.0', 4),
  ('google/gemini-2.5-pro', 'Crossi 2.0 Lite', 3.5),
  ('openai/gpt-5-mini', 'Crossi 2.0 Mini', 2),
  ('google/gemini-2.5-flash', 'Crossi 2.0 Mini Lite', 1.5),
  ('google/gemini-2.5-flash-image', 'Crossi 1.5 Image Gen', 1),
  ('openai/gpt-5-nano', 'Crossi 1.0 Pro', 1),
  ('google/gemini-2.5-flash-lite', 'Crossi 1.0 Pro Lite', 0.5);

-- Create trigger to update updated_at
CREATE TRIGGER update_model_costs_updated_at
BEFORE UPDATE ON public.model_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Grant admin role to the specified email
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'cross.a.trix.owner@hotmail.com';
  
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;