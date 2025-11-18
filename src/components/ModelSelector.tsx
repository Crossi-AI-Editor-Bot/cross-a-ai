import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain } from "lucide-react";

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

const models = [
  { value: "INVALIDopenai/gpt-5", label: "Cross 1.0 Pro (Not Aviable for this Month) (High Detail)", cost: 1/0 },
  { value: "INVALIDgoogle/gemini-2.5-pro", label: "Crossi 1.0 Pro Lite (Not Aviable for this Month) (High Detail)", cost: 1/0 },
 // { value: "INVALIDgoogle/gemini-2.5-flash-image", label: "Crossi 1.0 Image Gen", cost: 1.5 },
 // { value: "INVALIDopenai/gpt-5-mini", label: "Crossi 1.0", cost: 1 },
 // { value: "INVALIDgoogle/gemini-2.5-flash", label: "Crossi 1.0 Lite", cost:  },
  { value: "INVALIDopenai/gpt-5-nano", label: "Crossi 1.0 Mini", cost: 4 },
  { value: "INVALIDgoogle/gemini-2.5-flash-lite", label: "Crossi 1.0 Mini Lite", cost: 3 },
  { value: "Null", label: "Crossi 2.0 (Not available yet)", cost: 1/0},
];

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const selectedModel = models.find(m => m.value === value);

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
        {models.map((model) => (
          <SelectItem key={model.value} value={model.value}>
            {model.label} ({model.cost} credits)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
export { models };
