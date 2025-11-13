import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain } from "lucide-react";

export type AIModel = 
  | "openai/gpt-5-nano"
  | "openai/gpt-5-mini"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-flash"
  | "openai/gpt-5"
  | "google/gemini-2.5-pro";

interface ModelSelectorProps {
  value: AIModel;
  onChange: (value: AIModel) => void;
}

const models = [
  { value: "openai/gpt-5-nano", label: "GPT 5 Nano", cost: 0.5 },
  { value: "openai/gpt-5-mini", label: "GPT 5 Mini", cost: 1 },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", cost: 0.5 },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", cost: 1 },
  { value: "openai/gpt-5", label: "GPT 5 (High Detail)", cost: 3 },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (High Detail)", cost: 3 },
];

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const selectedModel = models.find(m => m.value === value);

  return (
    <div className="flex items-center gap-2">
      <Brain className="w-4 h-4 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as AIModel)}>
        <SelectTrigger className="w-[240px]">
          <SelectValue>
            {selectedModel?.label} ({selectedModel?.cost} credits)
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.value} value={model.value}>
              {model.label} ({model.cost} credits)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ModelSelector;
export { models };
