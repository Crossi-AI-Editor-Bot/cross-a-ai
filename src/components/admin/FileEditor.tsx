import { Crown, ImageIcon, Power, PowerOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const IMAGE_MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];

interface ModelData {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  vip_only: boolean;
  folder: string | null;
  image_cost: number;
}

interface FileEditorProps {
  model: ModelData;
  onUpdateLabel: (value: string) => void;
  onUpdateCost: (value: number) => void;
  onUpdateEnabled: (value: boolean) => void;
  onUpdateVipOnly: (value: boolean) => void;
  onUpdateImageCost?: (value: number) => void;
}

export const FileEditor = ({
  model,
  onUpdateLabel,
  onUpdateCost,
  onUpdateEnabled,
  onUpdateVipOnly,
  onUpdateImageCost,
}: FileEditorProps) => {
  const isImageModel = IMAGE_MODELS.includes(model.model_id);
  
  return (
    <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 px-4 py-2 bg-card border-b-2 border-primary">
          <span className="text-sm font-medium text-primary">{model.label}.txt</span>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto p-4 font-mono text-sm">
        <div className="space-y-4 bg-muted/30 rounded-lg p-4 border border-border">
          {/* File header comment */}
          <div className="text-muted-foreground">
            <span className="text-green-500">{"// "}</span>
            <span>Model Configuration File</span>
          </div>
          <div className="text-muted-foreground">
            <span className="text-green-500">{"// "}</span>
            <span>ID: {model.model_id}</span>
          </div>
          <div className="text-muted-foreground mb-4">
            <span className="text-green-500">{"// "}</span>
            <span>Edit the properties below</span>
          </div>

          <div className="h-px bg-border my-4" />

          {/* Display Name */}
          <div className="flex items-center gap-2">
            <span className="text-purple-400">display_name</span>
            <span className="text-muted-foreground">=</span>
            <span className="text-yellow-400">"</span>
            <Input
              value={model.label}
              onChange={(e) => onUpdateLabel(e.target.value)}
              className="h-7 w-64 text-sm font-mono bg-background inline-flex"
            />
            <span className="text-yellow-400">"</span>
          </div>

          {/* Cost */}
          <div className="flex items-center gap-2">
            <span className="text-purple-400">credit_cost</span>
            <span className="text-muted-foreground">=</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={model.cost}
              onChange={(e) => onUpdateCost(parseFloat(e.target.value) || 0)}
              className="h-7 w-24 text-sm font-mono bg-background text-orange-400"
            />
          </div>

          {/* Image Cost - only show for image models */}
          {isImageModel && onUpdateImageCost && (
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-purple-400" />
              <span className="text-purple-400">image_credit_cost</span>
              <span className="text-muted-foreground">=</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={model.image_cost}
                onChange={(e) => onUpdateImageCost(parseFloat(e.target.value) || 0)}
                className="h-7 w-24 text-sm font-mono bg-background text-purple-400"
              />
            </div>
          )}

          <div className="h-px bg-border my-4" />

          {/* Status Flags */}
          <div className="text-muted-foreground mb-2">
            <span className="text-green-500">{"// "}</span>
            <span>Status flags</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">enabled</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.enabled}
                onCheckedChange={onUpdateEnabled}
              />
              <span className={model.enabled ? "text-green-400" : "text-red-400"}>
                {model.enabled ? "true" : "false"}
              </span>
              {model.enabled ? (
                <Power className="h-4 w-4 text-green-400" />
              ) : (
                <PowerOff className="h-4 w-4 text-red-400" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">vip_only</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.vip_only}
                onCheckedChange={onUpdateVipOnly}
              />
              <span className={model.vip_only ? "text-yellow-400" : "text-muted-foreground"}>
                {model.vip_only ? "true" : "false"}
              </span>
              {model.vip_only && <Crown className="h-4 w-4 text-yellow-500" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};