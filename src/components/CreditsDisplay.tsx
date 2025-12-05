import { Coins, Crown } from "lucide-react";
import { type AIModel } from "@/components/ModelSelector";
import { useModelCosts } from "@/hooks/useModelCosts";
import { useVipStatus } from "@/hooks/useVipStatus";

interface CreditsDisplayProps {
  credits: number;
  selectedModel?: AIModel;
}

const CreditsDisplay = ({ credits, selectedModel }: CreditsDisplayProps) => {
  const { modelCosts } = useModelCosts();
  const { isVip } = useVipStatus();
  
  const modelCost = selectedModel 
    ? modelCosts.find(m => m.model_id === selectedModel)?.cost || 0 
    : 0;

  const maxCredits = isVip ? 20 : 15;

  return (
    <div className="flex items-center gap-2">
      {isVip && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-lg">
          <Crown className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-500 hidden sm:inline">VIP</span>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
        <Coins className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {credits.toFixed(1)} / {maxCredits} {selectedModel && `(-${modelCost})`}
        </span>
      </div>
    </div>
  );
};

export default CreditsDisplay;
