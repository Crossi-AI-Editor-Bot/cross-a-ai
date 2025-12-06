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
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ModelFile {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  vip_only: boolean;
  folder: string | null;
}

interface FileExplorerProps {
  models: ModelFile[];
  selectedFile: string | null;
  onSelectFile: (modelId: string | null) => void;
  onUpdateFolder: (modelId: string, folder: string | null) => void;
  folders: string[];
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (name: string) => void;
}

export const FileExplorer = ({
  models,
  selectedFile,
  onSelectFile,
  onUpdateFolder,
  folders,
  onCreateFolder,
  onDeleteFolder,
}: FileExplorerProps) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedModel, setDraggedModel] = useState<string | null>(null);

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

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setCreatingFolder(false);
    }
  };

  const handleDrop = (folder: string | null) => {
    if (draggedModel) {
      onUpdateFolder(draggedModel, folder);
      setDraggedModel(null);
    }
  };

  const rootModels = models.filter((m) => !m.folder);
  const getModelsInFolder = (folder: string) => models.filter((m) => m.folder === folder);

  return (
    <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-sm font-medium text-foreground">Models</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setCreatingFolder(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {/* New folder input */}
        {creatingFolder && (
          <div className="flex items-center gap-1 px-2 py-1">
            <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setCreatingFolder(false);
              }}
              className="h-6 text-xs"
              placeholder="Folder name..."
            />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCreateFolder}>
              <Save className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCreatingFolder(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Folders */}
        {folders.map((folder) => (
          <div key={folder}>
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted group",
                expandedFolders.has(folder) && "bg-muted/50"
              )}
              onClick={() => toggleFolder(folder)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(folder)}
            >
              {expandedFolders.has(folder) ? (
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
              <span className="text-sm text-foreground truncate flex-1">{folder}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            {expandedFolders.has(folder) && (
              <div className="ml-4 pl-2 border-l border-border/50">
                {getModelsInFolder(folder).map((model) => (
                  <FileItem
                    key={model.model_id}
                    model={model}
                    isSelected={selectedFile === model.model_id}
                    onSelect={() => onSelectFile(model.model_id)}
                    onDragStart={() => setDraggedModel(model.model_id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Root files (no folder) */}
        <div
          className="pt-2 border-t border-border/50 mt-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(null)}
        >
          <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider">
            Unsorted
          </div>
          {rootModels.map((model) => (
            <FileItem
              key={model.model_id}
              model={model}
              isSelected={selectedFile === model.model_id}
              onSelect={() => onSelectFile(model.model_id)}
              onDragStart={() => setDraggedModel(model.model_id)}
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
  onDragStart: () => void;
}

const FileItem = ({ model, isSelected, onSelect, onDragStart }: FileItemProps) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
        isSelected
          ? "bg-primary/20 text-primary"
          : "hover:bg-muted text-foreground",
        !model.enabled && "opacity-50"
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-blue-400" />
      <span className="text-sm truncate">{model.label}.txt</span>
    </div>
  );
};