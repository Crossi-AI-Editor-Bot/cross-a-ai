import { Coins, Crown, Sparkles, Video, Mic } from "lucide-react";
import { useVipStatus } from "@/hooks/useVipStatus";
import type { ModelCost } from "@/hooks/useModelCosts";
import { isMediaModel, isMagicHourImage, isMagicHourVideo, isMagicHourAudio } from "@/lib/externalModels";
import { useVideoCredits } from "@/hooks/useVideoCredits";
import { useAudioCredits } from "@/hooks/useAudioCredits";

interface CreditsDisplayProps {
  credits: number;
  imageCredits?: number;
  selectedModelCostId?: string;
  models: ModelCost[];
}

const formatCredits = (value: number): string => {
  if (Number.isInteger(value)) return value.toString();
  const formatted = value.toFixed(5);
  return formatted.replace(/\.?0+$/, "");
};

const CreditsDisplay = ({ credits, imageCredits, selectedModelCostId, models }: CreditsDisplayProps) => {
  const { isVip, isUnlimited } = useVipStatus();
  const { videoCredits } = useVideoCredits();
  const { audioCredits } = useAudioCredits();

  const modelData = selectedModelCostId ? models.find((m) => m.id === selectedModelCostId) : null;
  const modelId = modelData?.model_id;

  const isMedia = modelId ? isMediaModel(modelId) : false;
  const isImage = modelId ? (isMagicHourImage(modelId) || (modelId === 'google/gemini-2.5-flash-image' || modelId === 'google/gemini-3-pro-image-preview')) : false;
  const isVideo = modelId ? isMagicHourVideo(modelId) : false;
  const isAudio = modelId ? isMagicHourAudio(modelId) : false;

  const modelCost = modelData?.cost || 0;
  const imageCost = (modelData as any)?.image_cost || 0;
  const videoPerSec = (modelData as any)?.video_credits_per_second || 1;
  const audioPerThreeWords = (modelData as any)?.audio_credits_per_second || 1;

  const maxCredits = isVip ? 20 : 15;

  return (
    <div className="flex items-center gap-2">
      {isVip && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-lg">
          <Crown className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-500 hidden sm:inline">VIP</span>
        </div>
      )}

      {/* Image credits pill */}
      {isImage && imageCredits !== undefined && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">
            {`${formatCredits(imageCredits)} ${imageCost > 0 ? `(-${imageCost})` : ""}`}
          </span>
        </div>
      )}

      {/* Video credits pill - light blue */}
      {isVideo && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-sky-500/10 to-cyan-500/10 border border-sky-500/30 rounded-lg">
          <Video className="w-4 h-4 text-sky-300" />
          <span className="text-sm font-medium text-sky-300">
            {`${formatCredits(videoCredits)} ${videoPerSec > 0 ? `(-${videoPerSec}/s)` : ""}`}
          </span>
        </div>
      )}

      {/* Audio credits pill - orange */}
      {isAudio && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg">
          <Mic className="w-4 h-4 text-orange-300" />
          <span className="text-sm font-medium text-orange-300">
            {`${formatCredits(audioCredits)} ${audioPerThreeWords > 0 ? `(-${audioPerThreeWords}/3w)` : ""}`}
          </span>
        </div>
      )}

      {/* Regular credits - only show when NOT a media model */}
      {!isMedia && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {isUnlimited ? "∞" : `${formatCredits(credits)} / ${maxCredits} ${modelData ? `(-${modelCost})` : ""}`}
          </span>
        </div>
      )}

    </div>
  );
};

export default CreditsDisplay;
