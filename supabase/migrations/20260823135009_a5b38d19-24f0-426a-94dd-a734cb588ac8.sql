CREATE TABLE public.chat_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content_base64 TEXT NOT NULL DEFAULT '',
  is_binary BOOLEAN NOT NULL DEFAULT false,
  is_dir BOOLEAN NOT NULL DEFAULT false,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_files TO authenticated;
GRANT ALL ON public.chat_files TO service_role;
ALTER TABLE public.chat_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own chat files" ON public.chat_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.model_costs ADD COLUMN IF NOT EXISTS tool_terminal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS terminal_cwd TEXT NOT NULL DEFAULT '/';