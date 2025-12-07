import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Power, PowerOff, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useModelCosts } from "@/hooks/useModelCosts";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { supabase } from "@/integrations/supabase/client";
import { FileExplorer } from "@/components/admin/FileExplorer";
import { FileEditor } from "@/components/admin/FileEditor";

interface ModelState {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  vip_only: boolean;
  folder: string | null;
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { modelCosts, loading: costsLoading } = useModelCosts();
  const { isDisabled, disabledUntil, disableSite, enableSite, loading: siteLoading } = useSiteStatus();
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingSite, setTogglingSite] = useState(false);

  // Load folders from database
  useEffect(() => {
    const loadFolders = async () => {
      try {
        const { data, error } = await supabase
          .from("admin_folders")
          .select("path");
        
        if (error) throw error;
        
        if (data) {
          setCustomFolders(data.map((f) => f.path));
        }
      } catch (error) {
        console.error("Error loading folders:", error);
      } finally {
        setFoldersLoading(false);
      }
    };

    if (isAdmin) {
      loadFolders();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    const initialModels: ModelState[] = modelCosts.map((model) => ({
      id: model.id,
      model_id: model.model_id,
      label: model.label,
      cost: model.cost,
      enabled: model.enabled,
      vip_only: model.vip_only,
      folder: (model as any).folder || null,
    }));
    setModels(initialModels);
  }, [modelCosts]);

  const folders = useMemo(() => {
    const folderSet = new Set<string>(customFolders);
    models.forEach((m) => {
      if (m.folder) folderSet.add(m.folder);
    });
    return Array.from(folderSet).sort();
  }, [models, customFolders]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === selectedModelId),
    [models, selectedModelId]
  );

  const updateModel = (modelId: string, updates: Partial<ModelState>) => {
    setModels((prev) =>
      prev.map((m) => (m.model_id === modelId ? { ...m, ...updates } : m))
    );
  };

  const handleCreateFolder = async (name: string) => {
    if (!folders.includes(name)) {
      try {
        const { error } = await supabase
          .from("admin_folders")
          .insert({ path: name });
        
        if (error) throw error;
        
        setCustomFolders((prev) => [...prev, name]);
        toast({
          title: "Folder created",
          description: `Drag models into "${name}" to organize them.`,
        });
      } catch (error) {
        console.error("Error creating folder:", error);
        toast({
          title: "Error",
          description: "Failed to create folder",
          variant: "destructive",
        });
      }
    }
  };

  const handleDeleteFolder = async (name: string) => {
    try {
      // Delete the folder and all child folders
      const { error } = await supabase
        .from("admin_folders")
        .delete()
        .or(`path.eq.${name},path.like.${name}/%`);
      
      if (error) throw error;
      
      // Update local state - remove this folder and all children
      setCustomFolders((prev) => prev.filter((f) => f !== name && !f.startsWith(name + "/")));
      setModels((prev) =>
        prev.map((m) => 
          m.folder === name || m.folder?.startsWith(name + "/") 
            ? { ...m, folder: null } 
            : m
        )
      );
      toast({
        title: "Folder deleted",
        description: "Models have been moved to Unsorted.",
      });
    } catch (error) {
      console.error("Error deleting folder:", error);
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const model of models) {
        const { error } = await supabase
          .from("model_costs")
          .update({
            cost: model.cost,
            label: model.label,
            enabled: model.enabled,
            vip_only: model.vip_only,
            folder: model.folder,
          })
          .eq("model_id", model.model_id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Model settings saved successfully",
      });
    } catch (error) {
      console.error("Error updating model settings:", error);
      toast({
        title: "Error",
        description: "Failed to update model settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSite = async () => {
    setTogglingSite(true);
    try {
      if (isDisabled) {
        const success = await enableSite();
        if (success) {
          toast({ title: "Site enabled", description: "The site is now accessible to all users." });
        }
      } else {
        const success = await disableSite(1);
        if (success) {
          toast({ title: "Site disabled", description: "The site is now disabled for 1 day." });
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to toggle site status", variant: "destructive" });
    } finally {
      setTogglingSite(false);
    }
  };

  if (adminLoading || costsLoading || siteLoading || foldersLoading) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-6">
      <div className="container max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Chat
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <Monitor className="h-6 w-6 md:h-8 md:w-8" />
              Admin Control Panel
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleToggleSite}
              disabled={togglingSite}
              variant={isDisabled ? "default" : "destructive"}
              size="sm"
            >
              {isDisabled ? (
                <>
                  <Power className="w-4 h-4 mr-2" />
                  Enable Site
                </>
              ) : (
                <>
                  <PowerOff className="w-4 h-4 mr-2" />
                  Disable Site
                </>
              )}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save All"}
            </Button>
          </div>
        </div>

        {/* Site status banner */}
        {isDisabled && (
          <Card className="mb-4 border-destructive/50 bg-destructive/10">
            <CardContent className="py-3">
              <p className="text-sm text-destructive font-medium">
                Site is disabled until {disabledUntil?.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        )}

        {/* File Explorer Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Sidebar - File Explorer */}
          <div className="lg:col-span-4 xl:col-span-3 h-full">
            <FileExplorer
              models={models}
              selectedFile={selectedModelId}
              onSelectFile={setSelectedModelId}
              onUpdateFolder={(modelId, folder) => updateModel(modelId, { folder })}
              folders={folders}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
            />
          </div>

          {/* Main - File Editor */}
          <div className="lg:col-span-8 xl:col-span-9 h-full">
            {selectedModel ? (
              <FileEditor
                model={selectedModel}
                onUpdateLabel={(value) => updateModel(selectedModel.model_id, { label: value })}
                onUpdateCost={(value) => updateModel(selectedModel.model_id, { cost: value })}
                onUpdateEnabled={(value) => updateModel(selectedModel.model_id, { enabled: value })}
                onUpdateVipOnly={(value) => updateModel(selectedModel.model_id, { vip_only: value })}
              />
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center">
                  <CardDescription className="text-lg">
                    Select a model file to edit its configuration
                  </CardDescription>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;