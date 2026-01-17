import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Brain, Crown, Folder, ChevronRight } from "lucide-react";
import { useVipStatus, VipTier } from "@/hooks/useVipStatus";
import { useEffect, useMemo, useState } from "react";
import type { ModelCost } from "@/hooks/useModelCosts";

export type AIModel =
  | "openai/gpt-5-nano"
  | "openai/gpt-5-mini"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-flash-image"
  | "google/gemini-3-pro-image-preview"
  | "openai/gpt-5"
  | "google/gemini-2.5-pro"
  | "google/veo-3.1-fast";

interface ModelSelectorProps {
  models: ModelCost[];
  value?: string; // model_costs.id
  onChange: (id: string) => void;
}

// Helper to check if user has access to a model based on tier
const hasModelAccess = (model: ModelCost, tier: VipTier, isAdmin: boolean): boolean => {
  if (isAdmin) return true;
  
  // Check public access for non-VIP users
  if (!tier && model.public_access) return true;
  if (!tier) return false;
  
  // Check tier-specific access
  switch (tier) {
    case 'copper':
      return model.copper_access;
    case 'bronze':
      return model.bronze_access;
    case 'silver':
      return model.silver_access;
    case 'gold':
      return model.gold_access;
    case 'platinum':
      return model.platinum_access;
    case 'diamond':
      return model.diamond_access;
    default:
      return model.public_access;
  }
};

const ModelSelector = ({ models, value, onChange }: ModelSelectorProps) => {
  const { tier, isAdmin, loading: vipLoading } = useVipStatus();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Filter models based on enabled status and tier access
  const availableModels = models.filter((m) => {
    if (!m.enabled) return false;
    return hasModelAccess(m, tier, isAdmin);
  });

  const selectedModel = value ? availableModels.find((m) => m.id === value) : undefined;

  // Helper to check if model requires VIP (not public access)
  const isVipModel = (model: ModelCost): boolean => !model.public_access;

  // Group models by folder
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelCost[]> = {};
    const unsorted: ModelCost[] = [];

    availableModels.forEach((model) => {
      const folder = model.folder;
      if (folder) {
        const topFolder = folder.split("/")[0];
        if (!groups[topFolder]) groups[topFolder] = [];
        groups[topFolder].push(model);
      } else {
        unsorted.push(model);
      }
    });

    return { groups, unsorted };
  }, [availableModels]);

  const folderNames = Object.keys(groupedModels.groups).sort();

  // Initialize open folders - open the folder containing selected model
  useEffect(() => {
    if (folderNames.length > 0 && Object.keys(openFolders).length === 0) {
      const initialState: Record<string, boolean> = {};
      folderNames.forEach((name) => {
        const hasSelected = groupedModels.groups[name].some((m) => m.id === value);
        initialState[name] = hasSelected;
      });
      setOpenFolders(initialState);
    }
  }, [folderNames, groupedModels.groups, value, openFolders]);

  // Auto-select first available model if current selection is unavailable
  useEffect(() => {
    if (!vipLoading && availableModels.length > 0) {
      const isCurrentAvailable = value ? availableModels.some((m) => m.id === value) : false;
      if (!isCurrentAvailable) {
        onChange(availableModels[0].id);
      }
    }
  }, [availableModels, value, vipLoading, onChange]);

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  if (vipLoading) {
    return null;
  }

  const hasGroups = folderNames.length > 0;

  return (
    <Select value={value ?? ""} onValueChange={(v) => v && onChange(v)}>
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
              {selectedModel ? `${selectedModel.label} (${selectedModel.cost} credits)` : "Choose model"}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {/* Render grouped models by folder */}
        {folderNames.map((folderName) => (
          <Collapsible
            key={folderName}
            open={openFolders[folderName]}
            onOpenChange={() => toggleFolder(folderName)}
          >
            <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer">
              <ChevronRight
                className={`w-3 h-3 transition-transform ${openFolders[folderName] ? "rotate-90" : ""}`}
              />
              <Folder className="w-3 h-3" />
              {folderName}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {groupedModels.groups[folderName].map((model) => (
                <SelectItem key={model.id} value={model.id} className="pl-8">
                  <div className="flex items-center gap-2">
                    {isVipModel(model) && <Crown className="w-3 h-3 text-yellow-500" />}
                    <span>{model.label} ({model.cost} credits)</span>
                  </div>
                </SelectItem>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}

        {/* Render unsorted models */}
        {groupedModels.unsorted.length > 0 && (
          <>
            {hasGroups && (
              <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">Other</div>
            )}
            {groupedModels.unsorted.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className={hasGroups ? "pl-8" : ""}
              >
                <div className="flex items-center gap-2">
                  {isVipModel(model) && <Crown className="w-3 h-3 text-yellow-500" />}
                  <span>{model.label} ({model.cost} credits)</span>
                </div>
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;