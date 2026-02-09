import { useState } from "react";
import { Check, X, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VipTierIcon } from "@/components/VipTierIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVipTiers } from "@/hooks/useVipTiers";

const VipTierComparisonChart = () => {
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const { tiers, loading: tiersLoading } = useVipTiers();

  // Fetch models + their tier access from junction table
  const { data: modelsWithAccess = [] } = useQuery({
    queryKey: ["vip-models-access"],
    queryFn: async () => {
      const [modelsRes, accessRes] = await Promise.all([
        supabase
          .from("model_costs")
          .select("id, label, public_access")
          .eq("enabled", true)
          .order("label"),
        supabase
          .from("model_tier_access" as any)
          .select("model_cost_id, tier_name, has_access"),
      ]);

      if (modelsRes.error) throw modelsRes.error;
      if (accessRes.error) throw accessRes.error;

      const accessMap = new Map<string, Record<string, boolean>>();
      for (const row of (accessRes.data || []) as any[]) {
        if (!accessMap.has(row.model_cost_id)) {
          accessMap.set(row.model_cost_id, {});
        }
        accessMap.get(row.model_cost_id)![row.tier_name] = row.has_access;
      }

      return (modelsRes.data || []).map((m: any) => ({
        ...m,
        tier_access: accessMap.get(m.id) || {},
      }));
    },
  });

  const getExclusiveModels = (tierName: string): string[] => {
    return modelsWithAccess
      .filter((model) => {
        const hasAccess = model.tier_access[tierName] ?? false;
        return hasAccess && !model.public_access;
      })
      .map((model) => model.label);
  };

  const renderModelsCell = (tierName: string) => {
    const exclusiveModels = getExclusiveModels(tierName);
    
    if (exclusiveModels.length === 0) {
      return <span className="text-muted-foreground text-xs">Public only</span>;
    }

    const displayModels = exclusiveModels.slice(0, 2);
    const hasMore = exclusiveModels.length > 2;

    return (
      <Dialog open={openDialog === tierName} onOpenChange={(open) => setOpenDialog(open ? tierName : null)}>
        <DialogTrigger asChild>
          <button className="text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors w-full group">
            <div className="text-xs space-y-0.5">
              {displayModels.map((model) => (
                <div key={model} className="truncate max-w-[80px]" title={model}>
                  {model.replace("Crossi ", "").replace(" (Beta)", "")}
                </div>
              ))}
              {hasMore && (
                <div className="text-primary flex items-center gap-0.5 font-medium">
                  +{exclusiveModels.length - 2} more
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              )}
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <VipTierIcon tier={tierName} size="sm" />
              <span className="capitalize">{tierName}</span>
              <span>VIP Models</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {exclusiveModels.map((model) => (
                <div key={model} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm">{model}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  };

  if (tiersLoading) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-center">Tier Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[180px] font-semibold">Feature</TableHead>
                {tiers.map((tier) => (
                  <TableHead key={tier.name} className="text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <VipTierIcon tier={tier.name} size="sm" />
                      <span className={`capitalize text-xs font-medium ${tier.text_color}`}>
                        {tier.display_name}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/10">
                <TableCell className="font-medium text-sm">Exclusive VIP Models</TableCell>
                {tiers.map((tier) => (
                  <TableCell key={tier.name} className="text-center text-sm">
                    {renderModelsCell(tier.name)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Daily Credits</TableCell>
                {tiers.map((tier) => (
                  <TableCell key={tier.name} className="text-center text-sm">
                    <span className="font-medium">{tier.daily_credits}</span>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default VipTierComparisonChart;
