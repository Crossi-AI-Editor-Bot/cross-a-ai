import { Coins, Crown, Sparkles, Film, Volume2 } from "lucide-react";
import { useVipStatus } from "@/hooks/useVipStatus";
import type { ModelCost } from "@/hooks/useModelCosts";
import { isMediaModel } from "@/lib/externalModels";

interface CreditsDisplayProps {
  credits: number;
  imageCredits?: number;
  videoCredits?: number;
  audioCredits?: number;
  selectedModelCostId?: string;
  models: ModelCost[];
}

const formatCredits = (value: number): string => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

const CreditsDisplay = ({ credits, imageCredits = 0, videoCredits = 0, audioCredits = 0, selectedModelCostId, models }: CreditsDisplayProps) => {
  const { isVip, isUnlimited } = useVipStatus();

  const modelData = selectedModelCostId ? models.find((m) => m.id === selectedModelCostId) : null;
  const modelId = modelData?.model_id || "";

  // Ermittle Art des Models anhand des ID Prefixes
  const isImage = modelId.includes("image");
  const isVideo = modelId.includes("video");
  const isAudio = modelId.includes("music") || modelId.includes("audio");
  const isAnyMedia = isImage || isVideo || isAudio;

  const cost = modelData?.cost || 0;
  const mediaCost = (modelData as any)?.image_cost || 0;
  const maxCredits = isVip ? 20 : 15;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isVip && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-lg">
          <Crown className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-500 hidden sm:inline">VIP</span>
        </div>
      )}

      {/* Image-Modelle (Altes Design) */}
      {isImage && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">
            {isUnlimited ? "∞" : `${formatCredits(imageCredits)} ${mediaCost > 0 ? `(-${mediaCost})` : ""}`}
          </span>
        </div>
      )}

      {/* Video-Modelle (Hellblau) */}
      {isVideo && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 rounded-lg">
          <Film className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-medium text-sky-300">
            {isUnlimited ? "∞" : `${formatCredits(videoCredits)} ${mediaCost > 0 ? `(-${mediaCost})` : ""}`}
          </span>
        </div>
      )}

      {/* Audio-Modelle (Orange) */}
      {isAudio && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <Volume2 className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-orange-300">
            {isUnlimited ? "∞" : `${formatCredits(audioCredits)} ${mediaCost > 0 ? `(-${mediaCost})` : ""}`}
          </span>
        </div>
      )}

      {/* Standard-Text-Credits */}
      {!isAnyMedia && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {isUnlimited ? "∞" : `${formatCredits(credits)} / ${maxCredits} ${modelData ? `(-${cost})` : ""}`}
          </span>
        </div>
      )}
    </div>
  );
};

export default CreditsDisplay;
