import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain } from "lucide-react";
import { useModelCosts } from "@/hooks/useModelCosts";

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
  
  const selectedModel = modelCosts.find(m => m.model_id === value);

  if (loading) {
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
        {modelCosts.map((model) => (
          <SelectItem key={model.model_id} value={model.model_id}>
            {model.label} ({model.cost} credits)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
