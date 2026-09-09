import { supabase } from "@/integrations/supabase/client";
import { getUserId } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

export const adminStore = createSharedStore<boolean>(async () => {
  const userId = await getUserId();
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}, false, { ttlMs: 5 * 60_000 });

export const useIsAdmin = () => {
  const { value, loading } = adminStore.useStore();
  return { isAdmin: value, loading };
};
