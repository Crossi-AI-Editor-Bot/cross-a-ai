import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModelCost } from "@/hooks/useModelCosts";

const lastResetAt = (time: string) => {
  const [hh, mm] = (time || "00:00").split(":").map((n) => parseInt(n) || 0);
  const now = new Date();
  const r = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm));
  if (r > now) r.setUTCDate(r.getUTCDate() - 1);
  return r;
};

const FreeAllowancePill = ({ model }: { model: ModelCost }) => {
  const tpp = Math.max(1, model.free_tokens_per_percent ?? 1000);
  const { data: used = 0 } = useQuery({
    queryKey: ["free-usage", model.id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return 0;
      const { data } = await supabase
        .from("user_free_model_usage")
        .select("tokens_used, period_start")
        .eq("user_id", uid)
        .eq("model_cost_id", model.id)
        .maybeSingle();
      if (!data || new Date(data.period_start) < lastResetAt(model.free_reset_time_utc || "00:00")) return 0;
      return Number(data.tokens_used) || 0;
    },
  });

  const remaining = Math.max(0, Math.min(100, 100 - used / tpp));
  const r = 7;
  const c = 2 * Math.PI * r;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
      title={`${Math.round(remaining)}% of today's free allowance left · resets ${model.free_reset_time_utc || "00:00"} UTC`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <circle
          cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - remaining / 100)}
        />
      </svg>
      <span className="text-sm font-semibold">Free</span>
    </div>
  );
};

export default FreeAllowancePill;
