import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, Crown, Folder, ChevronRight, Lock } from "lucide-react";
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

// Get the minimum tier required to access a model
const getRequiredTier = (model: ModelCost): string | null => {
  if (model.public_access) return null;
  if (model.copper_access) return 'Copper';
  if (model.bronze_access) return 'Bronze';
  if (model.silver_access) return 'Silver';
  if (model.gold_access) return 'Gold';
  if (model.platinum_access) return 'Platinum';
  if (model.diamond_access) return 'Diamond';
  return 'VIP';
};

const ModelSelector = ({ models, value, onChange }: ModelSelectorProps) => {
  const { tier, isAdmin, loading: vipLoading } = useVipStatus();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Get all enabled models
  const enabledModels = models.filter((m) => m.enabled);
  
  // Filter models that user can access (for auto-selection logic)
  const availableModels = enabledModels.filter((m) => hasModelAccess(m, tier, isAdmin));

  const selectedModel = value ? enabledModels.find((m) => m.id === value) : undefined;

  // Helper to check if model requires VIP (not public access)
  const isVipModel = (model: ModelCost): boolean => !model.public_access;
  
  // Check if model is locked for current user
  const isModelLocked = (model: ModelCost): boolean => !hasModelAccess(model, tier, isAdmin);

  // Build nested folder tree structure
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
            currentLevel[part] = {
              name: part,
              path: currentPath,
              models: [],
              children: {},
            };
          }
          // Add model to the deepest folder
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

  // Get all folder paths for initialization
  const getAllFolderPaths = (nodes: Record<string, FolderNode>, parentPath = ""): string[] => {
    const paths: string[] = [];
    Object.values(nodes).forEach((node) => {
      paths.push(node.path);
      paths.push(...getAllFolderPaths(node.children, node.path));
    });
    return paths;
  };

  // Check if a folder or its children contain the selected model
  const folderContainsSelected = (node: FolderNode, selectedId: string | undefined): boolean => {
    if (!selectedId) return false;
    if (node.models.some((m) => m.id === selectedId)) return true;
    return Object.values(node.children).some((child) => folderContainsSelected(child, selectedId));
  };

  // Initialize open folders - open folders containing selected model
  useEffect(() => {
    if (topFolderNames.length > 0 && Object.keys(openFolders).length === 0) {
      const allPaths = getAllFolderPaths(folderTree);
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

  // Auto-select first available model if current selection is unavailable
  useEffect(() => {
    if (!vipLoading && availableModels.length > 0) {
      const isCurrentAvailable = value ? availableModels.some((m) => m.id === value) : false;
      if (!isCurrentAvailable) {
        onChange(availableModels[0].id);
      }
    }
  }, [availableModels, value, vipLoading, onChange]);

  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  if (vipLoading) {
    return null;
  }

  const hasGroups = topFolderNames.length > 0;

  // Render a single model item
  const renderModelItem = (model: ModelCost, indent: number = 0) => {
    const locked = isModelLocked(model);
    const requiredTier = getRequiredTier(model);
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

  // Recursively render folder nodes
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
          {/* Render models in this folder */}
          {hasModels && node.models.map((model) => renderModelItem(model, depth + 1))}
          
          {/* Render child folders */}
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
        <TooltipProvider delayDuration={300}>
          {/* Render folder tree */}
          {Object.values(folderTree)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((node) => renderFolderNode(node))}

          {/* Render unsorted models */}
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