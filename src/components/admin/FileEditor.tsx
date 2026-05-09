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
import { VipTierIcon } from "@/components/VipTierIcon";
import type { VipTierConfig } from "@/hooks/useVipTiers";
import { isOpenRouterModel, isMagnificModel, isMagnificImageModel, isMagnificVideoModel, isMagnificMusicModel } from "@/lib/externalModels";

const IMAGE_MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-3-pro-image-preview'];
const NANO_MODEL_ID = 'openai/gpt-5-nano';
const BUILTIN_DELETABLE = [NANO_MODEL_ID, ...IMAGE_MODELS];

interface ModelData {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  public_access: boolean;
  folder: string | null;
  image_cost: number;
  system_prompt?: string | null;
  is_fake?: boolean;
  fake_error_message?: string | null;
  tier_access: Record<string, boolean>;
}

interface FileEditorProps {
  model: ModelData;
  tiers: VipTierConfig[];
  onUpdateLabel: (value: string) => void;
  onUpdateCost: (value: number) => void;
  onUpdateEnabled: (value: boolean) => void;
  onUpdatePublicAccess: (value: boolean) => void;
  onUpdateTierAccess: (tierName: string, value: boolean) => void;
  onUpdateImageCost?: (value: number) => void;
  onUpdateSystemPrompt?: (value: string) => void;
  onUpdateIsFake?: (value: boolean) => void;
  onUpdateFakeErrorMessage?: (value: string) => void;
  onDelete?: () => void;
}

export const FileEditor = ({
  model,
  tiers,
  onUpdateLabel,
  onUpdateCost,
  onUpdateEnabled,
  onUpdatePublicAccess,
  onUpdateTierAccess,
  onUpdateImageCost,
  onUpdateSystemPrompt,
  onUpdateIsFake,
  onUpdateFakeErrorMessage,
  onDelete,
}: FileEditorProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isImageModel =
    IMAGE_MODELS.includes(model.model_id) ||
    isMagnificImageModel(model.model_id) ||
    isMagnificVideoModel(model.model_id) ||
    isMagnificMusicModel(model.model_id);
  const isDeletable =
    BUILTIN_DELETABLE.includes(model.model_id) ||
    isMagnificModel(model.model_id) ||
    isOpenRouterModel(model.model_id);

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
              This action cannot be undone. This will permanently delete this model configuration.
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
          {isDeletable && onDelete && (
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

          {/* Image Cost */}
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
              <Switch checked={model.enabled} onCheckedChange={onUpdateEnabled} />
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

          {/* Public access */}
          <div className="flex items-center gap-4">
            <span className="text-purple-400">public_access</span>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <Switch checked={model.public_access} onCheckedChange={onUpdatePublicAccess} />
              <span className={model.public_access ? "text-green-400" : "text-muted-foreground"}>
                {model.public_access ? "true" : "false"}
              </span>
              <span className="text-xs text-muted-foreground">(free users)</span>
            </div>
          </div>

          {/* Dynamic tier access */}
          {tiers.map((tier) => {
            const hasAccess = model.tier_access[tier.name] ?? true;
            return (
              <div key={tier.name} className="flex items-center gap-4">
                <span className="text-purple-400">{tier.name}_access</span>
                <span className="text-muted-foreground">=</span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={hasAccess}
                    onCheckedChange={(v) => onUpdateTierAccess(tier.name, v)}
                  />
                  <span className={hasAccess ? `${tier.text_color}` : "text-muted-foreground"}>
                    {hasAccess ? "true" : "false"}
                  </span>
                  <VipTierIcon tier={tier.name} size="sm" />
                </div>
              </div>
            );
          })}

          {/* System Prompt - only for Nano models */}
          {model.model_id === NANO_MODEL_ID && onUpdateSystemPrompt && (
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

          {/* Fake model toggle - admins can mark a model as non-functional with a custom error */}
          {onUpdateIsFake && (
            <>
              <div className="h-px bg-border my-4" />
              <div className="text-muted-foreground mb-2">
                <span className="text-green-500">{"// "}</span>
                <span>Fake Model (returns custom error, no credits drained)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400">is_fake</span>
                <Switch checked={!!model.is_fake} onCheckedChange={(v) => onUpdateIsFake(v)} />
              </div>
              {model.is_fake && onUpdateFakeErrorMessage && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-purple-400">fake_error_message</span>
                  <span className="text-muted-foreground">=</span>
                  <Textarea
                    value={model.fake_error_message || ""}
                    onChange={(e) => onUpdateFakeErrorMessage(e.target.value)}
                    placeholder="e.g. This model is currently overloaded. Please try again later."
                    className="min-h-[80px] text-sm font-mono bg-background"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
};
