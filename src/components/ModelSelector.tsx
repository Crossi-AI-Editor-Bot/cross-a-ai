import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Crown } from "lucide-react";
import { useModelCosts } from "@/hooks/useModelCosts";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useEffect } from "react";

export type AIModel = 
  | "openai/gpt-5-nano"
  | "openai/gpt-5-mini"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-flash-image"
  | "openai/gpt-5"
  | "google/gemini-2.5-pro";

interface ModelSelectorProps {
  value: AIModel;
  onChange: (value: AIModel) => void;
}

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const { modelCosts, loading } = useModelCosts();
  const { isVip, loading: vipLoading } = useVipStatus();
  
  // Filter models based on enabled status and VIP access
  const availableModels = modelCosts.filter(m => {
    if (!m.enabled) return false;
    if (m.vip_only && !isVip) return false;
    return true;
  });
  
  const selectedModel = modelCosts.find(m => m.model_id === value);
  
  // Auto-select first available model if current selection is unavailable
  useEffect(() => {
    if (!loading && !vipLoading && availableModels.length > 0) {
      const isCurrentAvailable = availableModels.some(m => m.model_id === value);
      if (!isCurrentAvailable) {
        onChange(availableModels[0].model_id as AIModel);
      }
    }
  }, [availableModels, value, loading, vipLoading, onChange]);

  if (loading || vipLoading) {
    return null;
  }

  return (
    <Select value={value} onValueChange={(v) => onChange(v as AIModel)}>
      <SelectTrigger className="w-10 h-10 p-0 md:w-[240px] md:p-2">
        {/* Mobile: Just icon */}
        <div className="flex items-center justify-center md:hidden">
          <Brain className="w-5 h-5" />
        </div>
        {/* Desktop: Icon + text */}
        <SelectValue className="hidden md:flex md:items-center md:gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-muted-foreground" />
            <span>
              {selectedModel?.label} ({selectedModel?.cost} credits)
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableModels.map((model) => (
          <SelectItem key={model.model_id} value={model.model_id}>
            <div className="flex items-center gap-2">
              {model.vip_only && <Crown className="w-3 h-3 text-yellow-500" />}
              <span>{model.label} ({model.cost} credits)</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
