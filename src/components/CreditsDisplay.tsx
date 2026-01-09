import { Coins, Crown, ImageIcon } from "lucide-react";
import { useVipStatus } from "@/hooks/useVipStatus";
import type { ModelCost } from "@/hooks/useModelCosts";

interface CreditsDisplayProps {
  credits: number;
  imageCredits?: number;
  selectedModelCostId?: string;
  models: ModelCost[];
}

const IMAGE_MODELS = ["google/gemini-2.5-flash-image", "google/gemini-3-pro-image-preview"] as const;

const CreditsDisplay = ({ credits, imageCredits, selectedModelCostId, models }: CreditsDisplayProps) => {
  const { isVip } = useVipStatus();

  const modelData = selectedModelCostId ? models.find((m) => m.id === selectedModelCostId) : null;
  const modelId = modelData?.model_id;

  const isImageModel = modelId ? IMAGE_MODELS.includes(modelId as any) : false;

  const modelCost = modelData?.cost || 0;
  const imageCost = (modelData as any)?.image_cost || 0;

  const maxCredits = isVip ? 20 : 15;

  return (
    <div className="flex items-center gap-2">
      {isVip && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-lg">
          <Crown className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-500 hidden sm:inline">VIP</span>
        </div>
      )}

      {/* Show image credits only when image model is selected */}
      {isImageModel && imageCredits !== undefined && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
          <ImageIcon className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">
            {imageCredits.toFixed(0)} / 30 {imageCost > 0 && `(-${imageCost})`}
          </span>
        </div>
      )}

      {/* Regular credits - only show when NOT an image model */}
      {!isImageModel && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {credits.toFixed(1)} / {maxCredits} {modelData && `(-${modelCost})`}
          </span>
        </div>
      )}
    </div>
  );
};

export default CreditsDisplay;
