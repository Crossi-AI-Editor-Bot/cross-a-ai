-- Create table for admin folders
CREATE TABLE public.admin_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_folders ENABLE ROW LEVEL SECURITY;

-- Only admins can manage folders
CREATE POLICY "Admins can view folders"
ON public.admin_folders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert folders"
ON public.admin_folders
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete folders"
ON public.admin_folders
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));