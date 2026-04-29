import { useState } from "react";
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  Save,
  X,
  GripVertical,
  ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PUTER_IMAGE_MODELS, PUTER_PREFIX, OPENROUTER_PREFIX, isPuterImageModel, isCrossiVideoModel } from "@/lib/externalModels";

const IMAGE_MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-3-pro-image-preview'];

// Built-in image bases (Lovable AI Gateway) shown alongside Puter.js options
const BUILTIN_IMAGE_BASES = [
  { id: "google/gemini-2.5-flash-image", label: "Nano Banana (2.5 Flash Image)" },
  { id: "google/gemini-3-pro-image-preview", label: "Crossi 3.0 Image (3 Pro Image)" },
];

const isImageLikeModel = (modelId: string) =>
  IMAGE_MODELS.includes(modelId) || isPuterImageModel(modelId) || isCrossiVideoModel(modelId);

interface ModelFile {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  public_access: boolean;
  folder: string | null;
  image_cost?: number;
  tier_access: Record<string, boolean>;
}

interface FileExplorerProps {
  models: ModelFile[];
  selectedFile: string | null;
  onSelectFile: (id: string | null) => void;
  onUpdateFolder: (id: string, folder: string | null) => void;
  folders: string[];
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (name: string) => void;
  onAddModel?: (modelId: string, label: string, folder?: string) => void;
}

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

const buildFolderTree = (folders: string[]): FolderNode[] => {
  const root: FolderNode[] = [];
  
  folders.forEach((folderPath) => {
    const parts = folderPath.split("/");
    let currentLevel = root;
    let currentPath = "";
    
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let existing = currentLevel.find((f) => f.name === part);
      if (!existing) {
        existing = { name: part, path: currentPath, children: [] };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    });
  });
  
  return root;
};

export const FileExplorer = ({
  models,
  selectedFile,
  onSelectFile,
  onUpdateFolder,
  folders,
  onCreateFolder,
  onDeleteFolder,
  onAddModel,
}: FileExplorerProps) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(folders));
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null); // null = root, string = parent path
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedItem, setDraggedItem] = useState<{ type: "model" | "folder"; id: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null | "unsorted">(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [showAddCallModel, setShowAddCallModel] = useState(false);
  const [showAddImageModel, setShowAddImageModel] = useState(false);
  const [selectedImageBase, setSelectedImageBase] = useState<string>(BUILTIN_IMAGE_BASES[0].id);
  const [newModelLabel, setNewModelLabel] = useState("");
  const [showAddOpenRouterModel, setShowAddOpenRouterModel] = useState(false);
  const [newOpenRouterId, setNewOpenRouterId] = useState("");

  const folderTree = buildFolderTree(folders);

  const handleAddModel = (isCallModel: boolean = false) => {
    if (newModelLabel.trim() && onAddModel) {
      if (isCallModel) {
        onAddModel("openai/gpt-5-nano", newModelLabel.trim(), "Call Models");
      } else {
        onAddModel("openai/gpt-5-nano", newModelLabel.trim());
      }
      setNewModelLabel("");
      setShowAddModel(false);
      setShowAddCallModel(false);
    }
  };

  const handleAddImageModel = () => {
    if (newModelLabel.trim() && onAddModel && selectedImageBase) {
      onAddModel(selectedImageBase, newModelLabel.trim());
      setNewModelLabel("");
      setSelectedImageBase(BUILTIN_IMAGE_BASES[0].id);
      setShowAddImageModel(false);
    }
  };

  const handleAddOpenRouterModel = () => {
    if (newOpenRouterId.trim() && newModelLabel.trim() && onAddModel) {
      const cleanId = newOpenRouterId.trim().replace(/^openrouter\//, "");
      onAddModel(`${OPENROUTER_PREFIX}${cleanId}`, newModelLabel.trim());
      setNewModelLabel("");
      setNewOpenRouterId("");
      setShowAddOpenRouterModel(false);
    }
  };

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const handleCreateFolder = (parentPath: string | null) => {
    if (newFolderName.trim()) {
      const fullPath = parentPath ? `${parentPath}/${newFolderName.trim()}` : newFolderName.trim();
      onCreateFolder(fullPath);
      setExpandedFolders((prev) => new Set([...prev, fullPath]));
      setNewFolderName("");
      setCreatingFolderIn(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, type: "model" | "folder", id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ type, id }));
    setDraggedItem({ type, id });
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent, folder: string | null | "unsorted") => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    // Prevent dropping a folder into itself or its children
    if (draggedItem?.type === "folder" && folder !== "unsorted" && folder !== null) {
      if (folder === draggedItem.id || folder.startsWith(draggedItem.id + "/")) {
        return;
      }
    }
    
    setDragOverFolder(folder);
  };

  const handleDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    const data = e.dataTransfer.getData("text/plain");
    let item = draggedItem;
    
    try {
      const parsed = JSON.parse(data);
      item = parsed;
    } catch {
      // Use draggedItem
    }
    
    if (!item) return;
    
    if (item.type === "model") {
      onUpdateFolder(item.id, targetFolder);
    } else if (item.type === "folder") {
      // Moving a folder into another folder
      const sourceFolder = item.id;
      
      // Prevent dropping into itself or children
      if (targetFolder === sourceFolder || (targetFolder && targetFolder.startsWith(sourceFolder + "/"))) {
        setDraggedItem(null);
        setDragOverFolder(null);
        return;
      }
      
      const folderName = sourceFolder.split("/").pop() || sourceFolder;
      const newPath = targetFolder ? `${targetFolder}/${folderName}` : folderName;
      
      // Update all models in this folder and subfolders
      models.forEach((model) => {
        if (model.folder === sourceFolder) {
          onUpdateFolder(model.id, newPath);
        } else if (model.folder?.startsWith(sourceFolder + "/")) {
          const newModelPath = model.folder.replace(sourceFolder, newPath);
          onUpdateFolder(model.id, newModelPath);
        }
      });
      
      // Update folder references
      onDeleteFolder(sourceFolder);
      onCreateFolder(newPath);
      
      // Also move any subfolders
      folders.forEach((f) => {
        if (f.startsWith(sourceFolder + "/")) {
          const newSubPath = f.replace(sourceFolder, newPath);
          onDeleteFolder(f);
          onCreateFolder(newSubPath);
        }
      });
    }
    
    setDraggedItem(null);
    setDragOverFolder(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverFolder(null);
  };

  const getModelsInFolder = (folderPath: string) => 
    models.filter((m) => m.folder === folderPath);

  const rootModels = models.filter((m) => !m.folder);

  const renderFolder = (node: FolderNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const modelsInFolder = getModelsInFolder(node.path);
    const isDragOver = dragOverFolder === node.path;
    const isDragging = draggedItem?.type === "folder" && draggedItem.id === node.path;
    
    return (
      <div key={node.path}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "folder", node.path)}
          onDragEnd={handleDragEnd}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer group transition-all",
            isExpanded && "bg-muted/50",
            isDragOver && "bg-primary/20 ring-2 ring-primary ring-inset",
            isDragging && "opacity-30",
            !isDragOver && !isDragging && "hover:bg-muted"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleFolder(node.path)}
          onDragOver={(e) => handleDragOver(e, node.path)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.path)}
        >
          <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
          {isExpanded ? (
            <>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
            </>
          )}
          <span className="text-sm text-foreground truncate flex-1">{node.name}</span>
          <span className="text-xs text-muted-foreground mr-1">
            {modelsInFolder.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setCreatingFolderIn(node.path);
            }}
            title="Create subfolder"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(node.path);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
        {isExpanded && (
          <div 
            className="border-l border-border/50 ml-4"
            style={{ marginLeft: `${depth * 12 + 20}px` }}
            onDragOver={(e) => handleDragOver(e, node.path)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node.path)}
          >
            {/* Subfolder creation input */}
            {creatingFolderIn === node.path && (
              <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-md ml-2">
                <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder(node.path);
                    if (e.key === "Escape") setCreatingFolderIn(null);
                  }}
                  className="h-6 text-xs"
                  placeholder="Subfolder name..."
                />
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleCreateFolder(node.path)}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCreatingFolderIn(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            {/* Subfolders */}
            {node.children.map((child) => renderFolder(child, depth + 1))}
            
            {/* Models in folder */}
            {modelsInFolder.length === 0 && node.children.length === 0 && creatingFolderIn !== node.path && (
              <div className="px-2 py-2 text-xs text-muted-foreground italic ml-2">
                Drop items here
              </div>
            )}
            {modelsInFolder.map((model) => (
              <FileItem
                key={model.id}
                model={model}
                isSelected={selectedFile === model.id}
                onSelect={() => onSelectFile(model.id)}
                onDragStart={(e) => handleDragStart(e, "model", model.id)}
                onDragEnd={handleDragEnd}
                isDragging={draggedItem?.type === "model" && draggedItem.id === model.id}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-sm font-medium text-foreground">Models</span>
        <div className="flex items-center gap-1">
          {onAddModel && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowAddModel(true)}
                title="Add GPT-5 Nano"
              >
                <Plus className="h-3 w-3 mr-1" />
                Nano
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowAddCallModel(true)}
                title="Add Call Model"
              >
                <Plus className="h-3 w-3 mr-1" />
                Call
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowAddImageModel(true)}
                title="Add Image Model"
              >
                <Plus className="h-3 w-3 mr-1" />
                Image
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowAddOpenRouterModel(true)}
                title="Add OpenRouter Model"
              >
                <Plus className="h-3 w-3 mr-1" />
                OpenRouter
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setCreatingFolderIn("__root__")}
            title="Create folder"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {/* Add new model input */}
        {showAddModel && (
          <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-md mb-2">
            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
            <Input
              autoFocus
              value={newModelLabel}
              onChange={(e) => setNewModelLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddModel(false);
                if (e.key === "Escape") setShowAddModel(false);
              }}
              className="h-6 text-xs"
              placeholder="Model display name..."
            />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleAddModel(false)}>
              <Save className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAddModel(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Add new call model input */}
        {showAddCallModel && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded-md mb-2">
            <FileText className="h-4 w-4 text-green-400 shrink-0" />
            <Input
              autoFocus
              value={newModelLabel}
              onChange={(e) => setNewModelLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddModel(true);
                if (e.key === "Escape") setShowAddCallModel(false);
              }}
              className="h-6 text-xs"
              placeholder="Call model name..."
            />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleAddModel(true)}>
              <Save className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAddCallModel(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Add new image model input */}
        {showAddImageModel && (
          <div className="flex flex-col gap-1 px-2 py-2 bg-purple-500/20 rounded-md mb-2">
            <div className="flex items-center gap-1">
              <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />
              <span className="text-xs font-medium text-purple-400">New Image Model</span>
            </div>
            <Select value={selectedImageBase} onValueChange={setSelectedImageBase}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {BUILTIN_IMAGE_BASES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
                {PUTER_IMAGE_MODELS.map((m) => (
                  <SelectItem key={`${PUTER_PREFIX}${m.id}`} value={`${PUTER_PREFIX}${m.id}`}>
                    Puter · {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={newModelLabel}
                onChange={(e) => setNewModelLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddImageModel();
                  if (e.key === "Escape") setShowAddImageModel(false);
                }}
                className="h-6 text-xs"
                placeholder="Display name..."
              />
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleAddImageModel}>
                <Save className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAddImageModel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Add new OpenRouter model input */}
        {showAddOpenRouterModel && (
          <div className="flex flex-col gap-1 px-2 py-2 bg-orange-500/20 rounded-md mb-2">
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="text-xs font-medium text-orange-400">New OpenRouter Model</span>
            </div>
            <Input
              autoFocus
              value={newOpenRouterId}
              onChange={(e) => setNewOpenRouterId(e.target.value)}
              className="h-6 text-xs font-mono"
              placeholder="Model ID (e.g. openai/gpt-4o)"
            />
            <div className="flex items-center gap-1">
              <Input
                value={newModelLabel}
                onChange={(e) => setNewModelLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddOpenRouterModel();
                  if (e.key === "Escape") setShowAddOpenRouterModel(false);
                }}
                className="h-6 text-xs"
                placeholder="Display name..."
              />
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleAddOpenRouterModel}>
                <Save className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAddOpenRouterModel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* New root folder input */}
        {/* New root folder input */}
        {creatingFolderIn === "__root__" && (
          <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-md">
            <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder(null);
                if (e.key === "Escape") setCreatingFolderIn(null);
              }}
              className="h-6 text-xs"
              placeholder="Folder name..."
            />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleCreateFolder(null)}>
              <Save className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCreatingFolderIn(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Folder tree */}
        {folderTree.map((node) => renderFolder(node, 0))}

        {/* Root files (no folder) */}
        <div
          className={cn(
            "pt-2 border-t border-border/50 mt-2 rounded-md transition-all",
            dragOverFolder === "unsorted" && "bg-primary/20 ring-2 ring-primary ring-inset"
          )}
          onDragOver={(e) => handleDragOver(e, "unsorted")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>Unsorted</span>
            <span>{rootModels.length}</span>
          </div>
          {rootModels.map((model) => (
            <FileItem
              key={model.id}
              model={model}
              isSelected={selectedFile === model.id}
              onSelect={() => onSelectFile(model.id)}
              onDragStart={(e) => handleDragStart(e, "model", model.id)}
              onDragEnd={handleDragEnd}
              isDragging={draggedItem?.type === "model" && draggedItem.id === model.id}
              depth={0}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface FileItemProps {
  model: ModelFile;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  depth: number;
}

const FileItem = ({ model, isSelected, onSelect, onDragStart, onDragEnd, isDragging, depth }: FileItemProps) => {
  const isImageModel = isImageLikeModel(model.model_id);
  const displayCost = isImageModel ? (model.image_cost || 0) : model.cost;
  
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab transition-all group ml-2",
        isSelected
          ? "bg-primary/20 text-primary"
          : "hover:bg-muted text-foreground",
        !model.enabled && "opacity-50",
        isDragging && "opacity-30 ring-2 ring-primary"
      )}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
      {isImageModel ? (
        <ImageIcon className="h-4 w-4 shrink-0 text-purple-400" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-blue-400" />
      )}
      <span className="text-sm truncate flex-1">{model.label}.txt</span>
      <span className={cn(
        "text-xs font-mono",
        isImageModel ? "text-purple-400" : "text-orange-400"
      )}>
        {displayCost}
      </span>
    </div>
  );
};
