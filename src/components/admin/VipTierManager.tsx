import { useState } from "react";
import { Plus, Trash2, GripVertical, Save, Crown, Gem, Star, Award, Coins, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useVipTiers, type VipTierConfig } from "@/hooks/useVipTiers";

const ICON_OPTIONS = [
  { value: "Crown", label: "Crown" },
  { value: "Gem", label: "Gem" },
  { value: "Star", label: "Star" },
  { value: "Award", label: "Award" },
  { value: "Coins", label: "Coins" },
  { value: "Hexagon", label: "Hexagon" },
];

const iconMap: Record<string, typeof Crown> = { Crown, Gem, Star, Award, Coins, Hexagon };

const COLOR_PRESETS = [
  { label: "Orange", gradient_from: "from-orange-700", gradient_to: "to-orange-500", text_color: "text-orange-700", bg_color: "bg-orange-100", color: "orange-700" },
  { label: "Amber", gradient_from: "from-amber-700", gradient_to: "to-amber-500", text_color: "text-amber-700", bg_color: "bg-amber-100", color: "amber-700" },
  { label: "Slate", gradient_from: "from-slate-400", gradient_to: "to-slate-300", text_color: "text-slate-500", bg_color: "bg-slate-100", color: "slate-400" },
  { label: "Yellow", gradient_from: "from-yellow-500", gradient_to: "to-yellow-400", text_color: "text-yellow-600", bg_color: "bg-yellow-100", color: "yellow-500" },
  { label: "Purple", gradient_from: "from-purple-500", gradient_to: "to-purple-400", text_color: "text-purple-600", bg_color: "bg-purple-100", color: "purple-500" },
  { label: "Cyan", gradient_from: "from-cyan-400", gradient_to: "to-blue-500", text_color: "text-cyan-600", bg_color: "bg-cyan-100", color: "cyan-400" },
  { label: "Red", gradient_from: "from-red-500", gradient_to: "to-red-400", text_color: "text-red-600", bg_color: "bg-red-100", color: "red-500" },
  { label: "Green", gradient_from: "from-green-500", gradient_to: "to-green-400", text_color: "text-green-600", bg_color: "bg-green-100", color: "green-500" },
  { label: "Pink", gradient_from: "from-pink-500", gradient_to: "to-pink-400", text_color: "text-pink-600", bg_color: "bg-pink-100", color: "pink-500" },
  { label: "Emerald", gradient_from: "from-emerald-500", gradient_to: "to-emerald-400", text_color: "text-emerald-600", bg_color: "bg-emerald-100", color: "emerald-500" },
];

interface EditingTier {
  id?: string;
  name: string;
  display_name: string;
  daily_credits: number;
  sort_order: number;
  icon_name: string;
  colorPresetIndex: number;
}

const VipTierManager = () => {
  const { toast } = useToast();
  const { tiers, loading, createTier, updateTier, deleteTier } = useVipTiers();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<EditingTier | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const findColorPresetIndex = (tier: VipTierConfig): number => {
    const idx = COLOR_PRESETS.findIndex(p => p.gradient_from === tier.gradient_from);
    return idx >= 0 ? idx : 0;
  };

  const handleStartEdit = (tier: VipTierConfig) => {
    setEditingTier({
      id: tier.id,
      name: tier.name,
      display_name: tier.display_name,
      daily_credits: tier.daily_credits,
      sort_order: tier.sort_order,
      icon_name: tier.icon_name,
      colorPresetIndex: findColorPresetIndex(tier),
    });
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setEditingTier({
      name: "",
      display_name: "",
      daily_credits: 15,
      sort_order: (tiers.length + 1) * 10,
      icon_name: "Crown",
      colorPresetIndex: 0,
    });
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!editingTier) return;

    const preset = COLOR_PRESETS[editingTier.colorPresetIndex];
    const tierData = {
      name: editingTier.name.toLowerCase().replace(/\s+/g, '_'),
      display_name: editingTier.display_name,
      daily_credits: editingTier.daily_credits,
      sort_order: editingTier.sort_order,
      icon_name: editingTier.icon_name,
      color: preset.color,
      gradient_from: preset.gradient_from,
      gradient_to: preset.gradient_to,
      text_color: preset.text_color,
      bg_color: preset.bg_color,
    };

    try {
      if (isCreating) {
        await createTier.mutateAsync(tierData);
        toast({ title: "Tier created", description: `${tierData.display_name} tier has been created.` });
      } else if (editingTier.id) {
        await updateTier.mutateAsync({ id: editingTier.id, ...tierData });
        toast({ title: "Tier updated", description: `${tierData.display_name} tier has been updated.` });
      }
      setEditingTier(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTier.mutateAsync(deleteId);
      toast({ title: "Tier deleted", description: "The VIP tier has been removed." });
      setDeleteId(null);
      if (editingTier?.id === deleteId) setEditingTier(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return null;

  return (
    <>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VIP Tier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this tier. Users with this tier will lose their status. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5" />
                VIP Tier Management
              </CardTitle>
              <CardDescription>Add, edit, or remove VIP tiers</CardDescription>
            </div>
            <Button size="sm" onClick={handleStartCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Add Tier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tiers.map((tier) => {
              const Icon = iconMap[tier.icon_name] || Crown;
              return (
                <div
                  key={tier.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    editingTier?.id === tier.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleStartEdit(tier)}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${tier.gradient_from} ${tier.gradient_to} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{tier.display_name}</p>
                    <p className="text-xs text-muted-foreground">{tier.daily_credits} credits/day · Order: {tier.sort_order}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(tier.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Edit/Create Form */}
          {editingTier && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-3">
              <h4 className="font-medium text-sm">{isCreating ? "Create New Tier" : "Edit Tier"}</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Internal Name</label>
                  <Input
                    value={editingTier.name}
                    onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })}
                    placeholder="e.g. emerald"
                    className="h-8 text-sm"
                    disabled={!isCreating}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Display Name</label>
                  <Input
                    value={editingTier.display_name}
                    onChange={(e) => setEditingTier({ ...editingTier, display_name: e.target.value })}
                    placeholder="e.g. Emerald"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Daily Credits</label>
                  <Input
                    type="number"
                    value={editingTier.daily_credits}
                    onChange={(e) => setEditingTier({ ...editingTier, daily_credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sort Order</label>
                  <Input
                    type="number"
                    value={editingTier.sort_order}
                    onChange={(e) => setEditingTier({ ...editingTier, sort_order: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Icon</label>
                  <Select value={editingTier.icon_name} onValueChange={(v) => setEditingTier({ ...editingTier, icon_name: v })}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map((opt) => {
                        const I = iconMap[opt.value] || Crown;
                        return (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              <I className="w-4 h-4" />
                              {opt.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Color</label>
                  <Select
                    value={String(editingTier.colorPresetIndex)}
                    onValueChange={(v) => setEditingTier({ ...editingTier, colorPresetIndex: parseInt(v) })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_PRESETS.map((preset, i) => (
                        <SelectItem key={i} value={String(i)}>
                          <span className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full bg-gradient-to-r ${preset.gradient_from} ${preset.gradient_to}`} />
                            {preset.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSave} disabled={!editingTier.name || !editingTier.display_name}>
                  <Save className="w-4 h-4 mr-1" />
                  {isCreating ? "Create" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingTier(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default VipTierManager;
