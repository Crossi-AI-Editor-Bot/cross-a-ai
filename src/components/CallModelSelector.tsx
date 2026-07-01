import { useState, useMemo } from "react";
import { Phone, Lock, Folder, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useModelCosts, type ModelCost } from "@/hooks/useModelCosts";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useVipTiers } from "@/hooks/useVipTiers";
import { cn } from "@/lib/utils";

interface CallModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectModel: (model: ModelCost) => void;
}

const CallModelSelector = ({ open, onOpenChange, onSelectModel }: CallModelSelectorProps) => {
  const { modelCosts } = useModelCosts();
  const { tier: userTier, dynamicModelIds } = useVipStatus();
  const { tiers, tierNames } = useVipTiers();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const callModels = useMemo(() => {
    return modelCosts.filter(
      (m) => m.enabled && m.folder?.toLowerCase().startsWith("call models")
    );
  }, [modelCosts]);

  const canAccessModel = (model: ModelCost): boolean => {
    if (dynamicModelIds?.includes(model.id)) return true;
    if (model.public_access) return true;
    if (!userTier) return false;
    return model.tier_access[userTier] ?? false;
  };

  const getRequiredTier = (model: ModelCost): string | null => {
    if (model.public_access) return null;
    for (const tier of tiers) {
      if (model.tier_access[tier.name]) {
        return tier.display_name;
      }
    }
    return null;
  };

  const handleSelect = (model: ModelCost) => {
    if (canAccessModel(model)) {
      onSelectModel(model);
      onOpenChange(false);
    }
  };

  interface FolderNode {
    name: string;
    path: string;
    models: ModelCost[];
    children: Record<string, FolderNode>;
  }

  // Build folder tree, stripping the leading "Call Models" root so subfolders show as top-level
  const folderTree = useMemo(() => {
    const tree: Record<string, FolderNode> = {};
    callModels.forEach((model) => {
      const raw = model.folder || "";
      const parts = raw.split("/").slice(1); // strip "Call Models"
      if (parts.length === 0) {
        // sits directly in Call Models root
        if (!tree["__root__"]) tree["__root__"] = { name: "General", path: "__root__", models: [], children: {} };
        tree["__root__"].models.push(model);
        return;
      }
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
    });
    return tree;
  }, [callModels]);

  const toggleFolder = (p: string) => setOpenFolders((prev) => ({ ...prev, [p]: !prev[p] }));

  const renderModelButton = (model: ModelCost) => {
    const isLocked = !canAccessModel(model);
    const requiredTier = getRequiredTier(model);
    return (
      <Button
        key={model.id}
        variant="outline"
        className={cn("w-full justify-between h-auto py-3 px-4", isLocked && "opacity-60 cursor-not-allowed")}
        onClick={() => handleSelect(model)}
        disabled={isLocked}
      >
        <div className="flex flex-col items-start gap-1">
          <span className="font-medium">{model.label}</span>
          <span className="text-xs text-muted-foreground">
            {model.cost} credit{model.cost !== 1 ? "s" : ""} per message
          </span>
        </div>
        {isLocked ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            {requiredTier}+
          </div>
        ) : (
          <Phone className="w-4 h-4 text-primary" />
        )}
      </Button>
    );
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0): JSX.Element => {
    const hasChildren = Object.keys(node.children).length > 0;
    return (
      <Collapsible key={node.path} open={openFolders[node.path] ?? depth === 0} onOpenChange={() => toggleFolder(node.path)}>
        <CollapsibleTrigger
          className="flex items-center gap-2 w-full py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${(openFolders[node.path] ?? depth === 0) ? "rotate-90" : ""}`} />
          <Folder className="w-3 h-3" />
          {node.name}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          {node.models.map((m) => renderModelButton(m))}
          {hasChildren && Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map((c) => renderFolderNode(c, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Select Call Model
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {callModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No call models available.</p>
              <p className="text-sm mt-1">Ask an admin to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.values(folderTree)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((node) => renderFolderNode(node))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CallModelSelector;
