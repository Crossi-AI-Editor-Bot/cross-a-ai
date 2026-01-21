import { useState } from "react";
import { Check, X, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VipTierIcon, type VipTierType } from "@/components/VipTierIcon";
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

const tiers: VipTierType[] = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];

interface ComparisonFeature {
  name: string;
  values: Record<VipTierType, string | boolean>;
}

const staticFeatures: ComparisonFeature[] = [
  {
    name: "Daily Credits",
    values: {
      copper: "16",
      bronze: "18",
      silver: "20",
      gold: "22",
      platinum: "24",
      diamond: "25",
    },
  },
  {
    name: "Priority Support",
    values: {
      copper: "Basic",
      bronze: true,
      silver: true,
      gold: true,
      platinum: true,
      diamond: "Direct Admin",
    },
  },
  {
    name: "Extended Chat History",
    values: {
      copper: false,
      bronze: false,
      silver: true,
      gold: true,
      platinum: true,
      diamond: true,
    },
  },
  {
    name: "Early Feature Access",
    values: {
      copper: false,
      bronze: false,
      silver: false,
      gold: true,
      platinum: true,
      diamond: true,
    },
  },
  {
    name: "Exclusive Features",
    values: {
      copper: false,
      bronze: false,
      silver: false,
      gold: false,
      platinum: true,
      diamond: true,
    },
  },
];

const tierColors: Record<VipTierType, string> = {
  copper: "text-orange-600",
  bronze: "text-amber-700",
  silver: "text-slate-400",
  gold: "text-yellow-500",
  platinum: "text-purple-500",
  diamond: "text-cyan-500",
};

interface ModelAccess {
  label: string;
  copper_access: boolean;
  bronze_access: boolean;
  silver_access: boolean;
  gold_access: boolean;
  platinum_access: boolean;
  diamond_access: boolean;
  public_access: boolean;
}

const VipTierComparisonChart = () => {
  const [openDialog, setOpenDialog] = useState<VipTierType | null>(null);

  const { data: models = [] } = useQuery({
    queryKey: ["vip-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_costs")
        .select("label, copper_access, bronze_access, silver_access, gold_access, platinum_access, diamond_access, public_access")
        .eq("enabled", true)
        .order("label");
      
      if (error) throw error;
      return data as ModelAccess[];
    },
  });

  // Get exclusive models for each tier (models that require VIP but this tier can access)
  const getExclusiveModels = (tier: VipTierType): string[] => {
    const tierAccessKey = `${tier}_access` as keyof ModelAccess;
    
    return models
      .filter((model) => {
        // Model must be accessible by this tier
        const hasAccess = model[tierAccessKey] as boolean;
        // Model must be VIP-exclusive (not public)
        const isVipExclusive = !model.public_access;
        return hasAccess && isVipExclusive;
      })
      .map((model) => model.label);
  };

  const renderValue = (value: string | boolean) => {
    if (typeof value === "boolean") {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />
      );
    }
    return <span className="font-medium">{value}</span>;
  };

  const renderModelsCell = (tier: VipTierType) => {
    const exclusiveModels = getExclusiveModels(tier);
    
    if (exclusiveModels.length === 0) {
      return <span className="text-muted-foreground text-xs">Public only</span>;
    }

    const displayModels = exclusiveModels.slice(0, 2);
    const hasMore = exclusiveModels.length > 2;

    return (
      <Dialog open={openDialog === tier} onOpenChange={(open) => setOpenDialog(open ? tier : null)}>
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
              <VipTierIcon tier={tier} size="sm" />
              <span className={`capitalize ${tierColors[tier]}`}>{tier}</span>
              <span>VIP Models</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {exclusiveModels.map((model) => (
                <div
                  key={model}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                >
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm">{model}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground mt-2">
            {tier === "diamond" 
              ? "Diamond tier has access to all VIP models"
              : `${exclusiveModels.length} exclusive model${exclusiveModels.length !== 1 ? "s" : ""} available`
            }
          </p>
        </DialogContent>
      </Dialog>
    );
  };

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
                  <TableHead key={tier} className="text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <VipTierIcon tier={tier} size="sm" />
                      <span className={`capitalize text-xs font-medium ${tierColors[tier]}`}>
                        {tier}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* VIP Models Row */}
              <TableRow className="bg-muted/10">
                <TableCell className="font-medium text-sm">
                  Exclusive VIP Models
                </TableCell>
                {tiers.map((tier) => (
                  <TableCell key={tier} className="text-center text-sm">
                    {renderModelsCell(tier)}
                  </TableCell>
                ))}
              </TableRow>
              
              {/* Static Features */}
              {staticFeatures.map((feature, index) => (
                <TableRow 
                  key={feature.name}
                  className={(index + 1) % 2 === 0 ? "bg-muted/10" : ""}
                >
                  <TableCell className="font-medium text-sm">
                    {feature.name}
                  </TableCell>
                  {tiers.map((tier) => (
                    <TableCell key={tier} className="text-center text-sm">
                      {renderValue(feature.values[tier])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default VipTierComparisonChart;
