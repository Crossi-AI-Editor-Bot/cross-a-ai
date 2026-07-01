import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, Crown, Folder, ChevronRight, Lock, RotateCcw } from "lucide-react";
import { useVipStatus, VipTier } from "@/hooks/useVipStatus";
import { useVipTiers } from "@/hooks/useVipTiers";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { ModelCost } from "@/hooks/useModelCosts";
import { supabase } from "@/integrations/supabase/client";

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
  value?: string;
  onChange: (id: string) => void;
}

// Dynamic access check using tier_access map
const hasModelAccess = (
  model: ModelCost,
  tier: VipTier,
  isAdmin: boolean,
  dynamicModelIds: string[] = [],
): boolean => {
  if (dynamicModelIds.includes(model.id)) return true;
  if (!tier && model.public_access) return true;
  if (!tier) return false;
  return model.tier_access[tier] ?? model.public_access;
};

// Get the minimum tier required using sorted tiers
const getRequiredTier = (model: ModelCost, tierNames: string[]): string | null => {
  if (model.public_access) return null;
  for (const name of tierNames) {
    if (model.tier_access[name]) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return 'VIP';
};

const ModelSelector = ({ models, value, onChange }: ModelSelectorProps) => {
  const { tier, isAdmin, loading: vipLoading, dynamicModelIds } = useVipStatus();
  const { tierNames } = useVipTiers();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);

  // Load the default model ID for this user's tier
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "default_models")
          .maybeSingle();
        const defaults = data?.value as Record<string, string> | null;
        const tierKey = tier || "public";
        const id = defaults?.[tierKey] || defaults?.["public"] || null;
        setDefaultModelId(id);
      } catch {
        setDefaultModelId(null);
      }
    };
    load();
  }, [tier]);

  const handleResetToDefault = useCallback(() => {
    if (defaultModelId && models.find((m) => m.id === defaultModelId && m.enabled)) {
      onChange(defaultModelId);
    }
  }, [defaultModelId, models, onChange]);

  const enabledModels = models.filter(
    (m) => m.enabled && !m.folder?.toLowerCase().startsWith("call models")
  );
  
  const availableModels = enabledModels.filter((m) => hasModelAccess(m, tier, isAdmin, dynamicModelIds));

  const selectedModel = value ? enabledModels.find((m) => m.id === value) : undefined;

  const isVipModel = (model: ModelCost): boolean => !model.public_access;
  const isModelLocked = (model: ModelCost): boolean => !hasModelAccess(model, tier, isAdmin, dynamicModelIds);

  interface FolderNode {
    name: string;
    path: string;
    models: ModelCost[];
    children: Record<string, FolderNode>;
  }

  const { folderTree, unsortedModels } = useMemo(() => {
    const tree: Record<string, FolderNode> = {};
    const unsorted: ModelCost[] = [];

    enabledModels.forEach((model) => {
      const folder = model.folder;
      if (folder) {
        const parts = folder.split("/");
        let currentLevel = tree;
        let currentPath = "";

        parts.forEach((part, index) => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          if (!currentLevel[part]) {
            currentLevel[part] = { name: part, path: currentPath, models: [], children: {} };
          }
          if (index === parts.length - 1) {
            currentLevel[part].models.push(model);
          }
          currentLevel = currentLevel[part].children;
        });
      } else {
        unsorted.push(model);
      }
    });

    return { folderTree: tree, unsortedModels: unsorted };
  }, [enabledModels]);

  const topFolderNames = Object.keys(folderTree).sort();

  const getAllFolderPaths = (nodes: Record<string, FolderNode>): string[] => {
    const paths: string[] = [];
    Object.values(nodes).forEach((node) => {
      paths.push(node.path);
      paths.push(...getAllFolderPaths(node.children));
    });
    return paths;
  };

  const folderContainsSelected = (node: FolderNode, selectedId: string | undefined): boolean => {
    if (!selectedId) return false;
    if (node.models.some((m) => m.id === selectedId)) return true;
    return Object.values(node.children).some((child) => folderContainsSelected(child, selectedId));
  };

  useEffect(() => {
    if (topFolderNames.length > 0 && Object.keys(openFolders).length === 0) {
      const initialState: Record<string, boolean> = {};
      const checkAndSetOpen = (nodes: Record<string, FolderNode>) => {
        Object.values(nodes).forEach((node) => {
          initialState[node.path] = folderContainsSelected(node, value);
          checkAndSetOpen(node.children);
        });
      };
      checkAndSetOpen(folderTree);
      setOpenFolders(initialState);
    }
  }, [topFolderNames, folderTree, value, openFolders]);

  useEffect(() => {
    if (!vipLoading && availableModels.length > 0) {
      const isCurrentAvailable = value ? availableModels.some((m) => m.id === value) : false;
      if (!isCurrentAvailable) {
        onChange(availableModels[0].id);
      }
    }
  }, [availableModels, value, vipLoading, onChange]);

  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }));
  };

  if (vipLoading) return null;

  const hasGroups = topFolderNames.length > 0;

  const renderModelItem = (model: ModelCost, indent: number = 0) => {
    const locked = isModelLocked(model);
    const requiredTier = getRequiredTier(model, tierNames);
    const paddingLeft = indent > 0 ? `${indent * 16 + 8}px` : undefined;

    return (
      <Tooltip key={model.id}>
        <TooltipTrigger asChild>
          <div>
            <SelectItem
              value={model.id}
              className={`${locked ? "opacity-50 cursor-not-allowed" : ""}`}
              style={{ paddingLeft }}
              disabled={locked}
            >
              <div className="flex items-center gap-2">
                {locked ? (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                ) : isVipModel(model) ? (
                  <Crown className="w-3 h-3 text-yellow-500" />
                ) : null}
                <span>{model.label} ({model.cost} credits)</span>
              </div>
            </SelectItem>
          </div>
        </TooltipTrigger>
        {locked && requiredTier && (
          <TooltipContent side="right">
            <p>Requires {requiredTier} VIP or higher</p>
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0): JSX.Element => {
    const hasChildren = Object.keys(node.children).length > 0;
    const hasModels = node.models.length > 0;
    const paddingLeft = depth * 16 + 8;

    return (
      <Collapsible
        key={node.path}
        open={openFolders[node.path]}
        onOpenChange={() => toggleFolder(node.path)}
      >
        <CollapsibleTrigger
          className="flex items-center gap-2 w-full py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform ${openFolders[node.path] ? "rotate-90" : ""}`}
          />
          <Folder className="w-3 h-3" />
          {node.name}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {hasModels && node.models.map((model) => renderModelItem(model, depth + 1))}
          {hasChildren &&
            Object.values(node.children)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((child) => renderFolderNode(child, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Select value={value ?? ""} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-10 h-10 p-0 md:w-[240px] md:p-2">
        <div className="flex items-center justify-center md:hidden">
          <Brain className="w-5 h-5" />
        </div>
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
        <TooltipProvider delayDuration={300}>
          {/* Reset to default */}
          {defaultModelId && defaultModelId !== value && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleResetToDefault();
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer mb-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default
            </button>
          )}

          {Object.values(folderTree)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((node) => renderFolderNode(node))}

          {unsortedModels.length > 0 && (
            <>
              {hasGroups && (
                <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">Other</div>
              )}
              {unsortedModels.map((model) => renderModelItem(model, hasGroups ? 1 : 0))}
            </>
          )}
        </TooltipProvider>
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
