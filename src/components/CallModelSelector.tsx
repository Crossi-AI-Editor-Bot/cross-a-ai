import { useState, useEffect, useMemo } from "react";
import { Phone, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useModelCosts, type ModelCost } from "@/hooks/useModelCosts";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useVipTiers } from "@/hooks/useVipTiers";
import { cn } from "@/lib/utils";

interface CallModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectModel: (model: ModelCost) => void;
}

const CallModelSelector = ({ open, onOpenChange, onSelectModel }: CallModelSelectorProps) => {
  const { modelCosts } = useModelCosts();
  const { tier: userTier, isAdmin } = useVipStatus();
  const { tiers, tierNames } = useVipTiers();

  const callModels = useMemo(() => {
    return modelCosts.filter(
      (m) => m.enabled && m.folder?.toLowerCase().startsWith("call models")
    );
  }, [modelCosts]);

  const canAccessModel = (model: ModelCost): boolean => {
    if (model.public_access) return true;
    if (!userTier) return false;
    
    // Check if user's tier or any lower tier grants access
    const userTierIndex = tierNames.indexOf(userTier);
    if (userTierIndex === -1) return false;
    
    // Check if user's specific tier has access
    return model.tier_access[userTier] ?? false;
  };

  const getRequiredTier = (model: ModelCost): string | null => {
    if (model.public_access) return null;
    for (const tier of tiers) {
      if (model.tier_access[tier.name]) {
        return tier.display_name;
      }
    }
    return null;
  };

  const handleSelect = (model: ModelCost) => {
    if (canAccessModel(model)) {
      onSelectModel(model);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Select Call Model
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {callModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No call models available.</p>
              <p className="text-sm mt-1">Ask an admin to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {callModels.map((model) => {
                const isLocked = !canAccessModel(model);
                const requiredTier = getRequiredTier(model);

                return (
                  <Button
                    key={model.id}
                    variant="outline"
                    className={cn(
                      "w-full justify-between h-auto py-3 px-4",
                      isLocked && "opacity-60 cursor-not-allowed"
                    )}
                    onClick={() => handleSelect(model)}
                    disabled={isLocked}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">{model.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.cost} credit{model.cost !== 1 ? "s" : ""} per message
                      </span>
                    </div>
                    {isLocked ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="w-3.5 h-3.5" />
                        {requiredTier}+
                      </div>
                    ) : (
                      <Phone className="w-4 h-4 text-primary" />
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CallModelSelector;
