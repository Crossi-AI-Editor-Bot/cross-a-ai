import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Power, PowerOff, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useModelCosts } from "@/hooks/useModelCosts";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { useVipTiers } from "@/hooks/useVipTiers";
import { supabase } from "@/integrations/supabase/client";
import { FileExplorer } from "@/components/admin/FileExplorer";
import { FileEditor } from "@/components/admin/FileEditor";
import { NotificationManager } from "@/components/admin/NotificationManager";
import VipTierManager from "@/components/admin/VipTierManager";
import DefaultModelManager from "@/components/admin/DefaultModelManager";
import InviteCodeManager from "@/components/admin/InviteCodeManager";
import GlobalPromptManager from "@/components/admin/GlobalPromptManager";
import BlockedIpsManager from "@/components/admin/BlockedIpsManager";

interface ModelState {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  public_access: boolean;
  folder: string | null;
  image_cost: number;
  system_prompt: string | null;
  tier_access: Record<string, boolean>;
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { modelCosts, loading: costsLoading } = useModelCosts();
  const { isDisabled, disabledUntil, disableSite, enableSite, loading: siteLoading } = useSiteStatus();
  const { tiers, loading: tiersLoading } = useVipTiers();
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingSite, setTogglingSite] = useState(false);
  const [appVersion, setAppVersion] = useState("0.0.0.0");

  // Load app version
  useEffect(() => {
    const loadVersion = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "app_version")
        .maybeSingle();
      
      if (data?.value) {
        setAppVersion(typeof data.value === 'string' ? data.value : (data.value as any).version || "0.0.0.0");
      }
    };
    if (isAdmin) loadVersion();
  }, [isAdmin]);

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
      public_access: model.public_access,
      folder: model.folder || null,
      image_cost: model.image_cost || 0,
      system_prompt: model.system_prompt || null,
      tier_access: { ...model.tier_access },
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
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId]
  );

  const updateModel = (id: string, updates: Partial<ModelState>) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const updateTierAccess = (modelId: string, tierName: string, value: boolean) => {
    setModels((prev) =>
      prev.map((m) =>
        m.id === modelId
          ? { ...m, tier_access: { ...m.tier_access, [tierName]: value } }
          : m
      )
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
      const { error } = await supabase
        .from("admin_folders")
        .delete()
        .or(`path.eq.${name},path.like.${name}/%`);
      
      if (error) throw error;
      
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

  const handleAddModel = async (modelId: string, label: string, folder?: string) => {
    try {
      const targetFolder = folder || "Beta";
      const { data, error } = await supabase
        .from("model_costs")
        .insert({
          model_id: modelId,
          label: label,
          cost: folder === "Call Models" ? 1 : 5,
          enabled: true,
          public_access: folder === "Call Models" ? true : false,
          folder: targetFolder,
          image_cost: 0,
          system_prompt: folder === "Call Models" 
            ? "You are a helpful voice assistant. Keep your responses concise and conversational since they will be spoken aloud. Avoid using markdown, lists, or special formatting. Respond naturally as if having a phone conversation."
            : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        // Tier access entries are auto-created by the DB trigger
        // Build default tier access (all true)
        const defaultTierAccess: Record<string, boolean> = {};
        tiers.forEach((t) => { defaultTierAccess[t.name] = true; });

        const newModel: ModelState = {
          id: data.id,
          model_id: data.model_id,
          label: data.label,
          cost: data.cost,
          enabled: data.enabled,
          public_access: data.public_access,
          folder: data.folder,
          image_cost: data.image_cost || 0,
          system_prompt: data.system_prompt || null,
          tier_access: defaultTierAccess,
        };
        setModels((prev) => [...prev, newModel]);
        setSelectedModelId(data.id);
        
        if (folder === "Call Models" && !customFolders.includes("Call Models")) {
          await supabase.from("admin_folders").insert({ path: "Call Models" });
          setCustomFolders((prev) => [...prev, "Call Models"]);
        }
        
        toast({
          title: "Model added",
          description: `${label} has been added to the ${targetFolder} folder.`,
        });
      }
    } catch (error) {
      console.error("Error adding model:", error);
      toast({
        title: "Error",
        description: "Failed to add model",
        variant: "destructive",
      });
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      const modelToDelete = models.find((m) => m.id === id);
      // Allow deleting Nano models, OpenRouter models, and any Magnific models.
      const mid = modelToDelete?.model_id || "";
      const allowed =
        !!modelToDelete &&
        (mid === 'openai/gpt-5-nano' ||
          mid.startsWith('openrouter/') ||
          mid.startsWith('magnific-image/') ||
          mid.startsWith('magnific-video/') ||
          mid.startsWith('magnific-music/'));
      if (!allowed) {
        toast({
          title: "Cannot delete",
          description: "This model cannot be removed.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("model_costs")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setModels((prev) => prev.filter((m) => m.id !== id));
      setSelectedModelId(null);
      toast({
        title: "Model deleted",
        description: `${modelToDelete.label} has been deleted.`,
      });
    } catch (error) {
      console.error("Error deleting model:", error);
      toast({
        title: "Error",
        description: "Failed to delete model",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save app version
      await supabase
        .from("site_settings")
        .upsert({ key: "app_version", value: appVersion }, { onConflict: "key" });

      for (const model of models) {
        // Save model core data
        const { error } = await supabase
          .from("model_costs")
          .update({
            cost: model.cost,
            label: model.label,
            enabled: model.enabled,
            public_access: model.public_access,
            folder: model.folder,
            image_cost: model.image_cost,
            system_prompt: model.system_prompt,
          })
          .eq("id", model.id);

        if (error) throw error;

        // Save tier access via upsert
        for (const [tierName, hasAccess] of Object.entries(model.tier_access)) {
          const { error: accessError } = await supabase
            .from("model_tier_access" as any)
            .upsert(
              {
                model_cost_id: model.id,
                tier_name: tierName,
                has_access: hasAccess,
              } as any,
              { onConflict: "model_cost_id,tier_name" }
            );

          if (accessError) throw accessError;
        }
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

  if (adminLoading || costsLoading || siteLoading || foldersLoading || tiersLoading) {
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
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="version" className="text-sm text-muted-foreground">Version:</Label>
              <Input
                id="version"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                className="w-32 h-8 text-sm"
                placeholder="0.0.0.0"
              />
            </div>
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

        {/* Notification Manager */}
        <div className="mb-6">
          <NotificationManager />
        </div>

        {/* VIP Tier Manager */}
        <div className="mb-6">
          <VipTierManager />
        </div>

        {/* Global Model Instructions */}
        <div className="mb-6">
          <GlobalPromptManager />
        </div>

        {/* Default Model Settings */}
        <div className="mb-6">
          <DefaultModelManager models={models} tiers={tiers} />
        </div>

        {/* Security - Blocked IPs & Jailbreak Attempts */}
        <div className="mb-6">
          <BlockedIpsManager />
        </div>

        {/* Invite Code Manager */}
        <div className="mb-6">
          <InviteCodeManager />
        </div>

        {/* File Explorer Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Sidebar - File Explorer */}
          <div className="lg:col-span-4 xl:col-span-3 h-full">
            <FileExplorer
              models={models}
              selectedFile={selectedModelId}
              onSelectFile={setSelectedModelId}
              onUpdateFolder={(id, folder) => updateModel(id, { folder })}
              folders={folders}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onAddModel={handleAddModel}
            />
          </div>

          {/* Main - File Editor */}
          <div className="lg:col-span-8 xl:col-span-9 h-full">
            {selectedModel ? (
              <FileEditor
                model={selectedModel}
                tiers={tiers}
                onUpdateLabel={(value) => updateModel(selectedModel.id, { label: value })}
                onUpdateCost={(value) => updateModel(selectedModel.id, { cost: value })}
                onUpdateEnabled={(value) => updateModel(selectedModel.id, { enabled: value })}
                onUpdatePublicAccess={(value) => updateModel(selectedModel.id, { public_access: value })}
                onUpdateTierAccess={(tierName, value) => updateTierAccess(selectedModel.id, tierName, value)}
                onUpdateImageCost={(value) => updateModel(selectedModel.id, { image_cost: value })}
                onUpdateSystemPrompt={(value) => updateModel(selectedModel.id, { system_prompt: value })}
                onDelete={() => handleDeleteModel(selectedModel.id)}
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
