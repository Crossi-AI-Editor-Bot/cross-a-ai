import { Coins } from "lucide-react";
import { models, type AIModel } from "@/components/ModelSelector";

interface CreditsDisplayProps {
  credits: number;
  selectedModel?: AIModel;
}

const CreditsDisplay = ({ credits, selectedModel }: CreditsDisplayProps) => {
  const modelCost = selectedModel 
    ? models.find(m => m.value === selectedModel)?.cost || 0 
    : 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
      <Coins className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium text-foreground">
        {credits.toFixed(1)} / 15 {selectedModel && `(-${modelCost})`}
      </span>
    </div>
  );
};

export default CreditsDisplay;
