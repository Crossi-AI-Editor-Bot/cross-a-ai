import { useState } from "react";
import { Crown, ImageIcon, Power, PowerOff, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const IMAGE_MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];
const NANO_MODEL_ID = 'openai/gpt-5-nano';

interface ModelData {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  public_access: boolean;
  bronze_access: boolean;
  silver_access: boolean;
  gold_access: boolean;
  diamond_access: boolean;
  folder: string | null;
  image_cost: number;
  system_prompt?: string | null;
}

interface FileEditorProps {
  model: ModelData;
  onUpdateLabel: (value: string) => void;
  onUpdateCost: (value: number) => void;
  onUpdateEnabled: (value: boolean) => void;
  onUpdatePublicAccess: (value: boolean) => void;
  onUpdateBronzeAccess: (value: boolean) => void;
  onUpdateSilverAccess: (value: boolean) => void;
  onUpdateGoldAccess: (value: boolean) => void;
  onUpdateDiamondAccess: (value: boolean) => void;
  onUpdateImageCost?: (value: number) => void;
  onUpdateSystemPrompt?: (value: string) => void;
  onDelete?: () => void;
}

export const FileEditor = ({
  model,
  onUpdateLabel,
  onUpdateCost,
  onUpdateEnabled,
  onUpdatePublicAccess,
  onUpdateBronzeAccess,
  onUpdateSilverAccess,
  onUpdateGoldAccess,
  onUpdateDiamondAccess,
  onUpdateImageCost,
  onUpdateSystemPrompt,
  onDelete,
}: FileEditorProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isImageModel = IMAGE_MODELS.includes(model.model_id);
  const isNanoModel = model.model_id === NANO_MODEL_ID;

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };
  
  return (
    <>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{model.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this GPT Nano model configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/50">
          <div className="flex items-center gap-2 px-4 py-2 bg-card border-b-2 border-primary">
            <span className="text-sm font-medium text-primary">{model.label}.txt</span>
          </div>
          {isNanoModel && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
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

          {/* Tier Access Controls */}
          <div className="h-px bg-border my-4" />
          <div className="text-muted-foreground mb-2">
            <span className="text-green-500">{"// "}</span>
            <span>Access Controls by Tier</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">public_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.public_access}
                onCheckedChange={onUpdatePublicAccess}
              />
              <span className={model.public_access ? "text-green-400" : "text-muted-foreground"}>
                {model.public_access ? "true" : "false"}
              </span>
              <span className="text-xs text-muted-foreground">(free users)</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">bronze_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.bronze_access}
                onCheckedChange={onUpdateBronzeAccess}
              />
              <span className={model.bronze_access ? "text-amber-600" : "text-muted-foreground"}>
                {model.bronze_access ? "true" : "false"}
              </span>
              <Crown className="h-4 w-4 text-amber-600" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">silver_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.silver_access}
                onCheckedChange={onUpdateSilverAccess}
              />
              <span className={model.silver_access ? "text-gray-400" : "text-muted-foreground"}>
                {model.silver_access ? "true" : "false"}
              </span>
              <Crown className="h-4 w-4 text-gray-400" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">gold_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.gold_access}
                onCheckedChange={onUpdateGoldAccess}
              />
              <span className={model.gold_access ? "text-yellow-400" : "text-muted-foreground"}>
                {model.gold_access ? "true" : "false"}
              </span>
              <Crown className="h-4 w-4 text-yellow-500" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-purple-400">diamond_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={model.diamond_access}
                onCheckedChange={onUpdateDiamondAccess}
              />
              <span className={model.diamond_access ? "text-cyan-400" : "text-muted-foreground"}>
                {model.diamond_access ? "true" : "false"}
              </span>
              <Crown className="h-4 w-4 text-cyan-400" />
            </div>
          </div>

          {/* System Prompt - only for Nano models */}
          {isNanoModel && onUpdateSystemPrompt && (
            <>
              <div className="h-px bg-border my-4" />
              <div className="text-muted-foreground mb-2">
                <span className="text-green-500">{"// "}</span>
                <span>Custom System Prompt (GPT Nano only)</span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-purple-400">system_prompt</span>
                <span className="text-muted-foreground">=</span>
                <Textarea
                  value={model.system_prompt || ""}
                  onChange={(e) => onUpdateSystemPrompt(e.target.value)}
                  placeholder="Enter a custom system prompt for this Nano model..."
                  className="min-h-[100px] text-sm font-mono bg-background"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
};