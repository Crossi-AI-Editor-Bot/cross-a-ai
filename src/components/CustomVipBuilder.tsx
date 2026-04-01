import { useState, useEffect } from "react";
import { Wand2, Coins, Sparkles, Check, Loader2, Crown, Gem, Star, Award, Hexagon, Shield, Zap, Heart, Flame, Diamond, Trophy, Medal, Rocket, Target, Sun, Moon, Globe, Key, Bell, Camera, Clock, Cloud, Compass, Coffee, Eye, Feather, Flag, Gift, Headphones, Layers, Leaf, Music, Palette, Plane, Power, Gamepad, Puzzle, Rainbow, Snowflake, Telescope, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useVipTiers } from "@/hooks/useVipTiers";
import { useCroins } from "@/hooks/useCroins";
import { supabase } from "@/integrations/supabase/client";

const ICON_OPTIONS: { value: string; icon: LucideIcon }[] = [
  { value: "Crown", icon: Crown }, { value: "Gem", icon: Gem }, { value: "Star", icon: Star },
  { value: "Award", icon: Award }, { value: "Hexagon", icon: Hexagon }, { value: "Shield", icon: Shield },
  { value: "Zap", icon: Zap }, { value: "Heart", icon: Heart }, { value: "Flame", icon: Flame },
  { value: "Diamond", icon: Diamond }, { value: "Trophy", icon: Trophy }, { value: "Medal", icon: Medal },
  { value: "Rocket", icon: Rocket }, { value: "Target", icon: Target }, { value: "Sun", icon: Sun },
  { value: "Moon", icon: Moon }, { value: "Globe", icon: Globe }, { value: "Key", icon: Key },
  { value: "Bell", icon: Bell }, { value: "Camera", icon: Camera }, { value: "Clock", icon: Clock },
  { value: "Cloud", icon: Cloud }, { value: "Compass", icon: Compass }, { value: "Coffee", icon: Coffee },
  { value: "Eye", icon: Eye }, { value: "Feather", icon: Feather }, { value: "Flag", icon: Flag },
  { value: "Gift", icon: Gift }, { value: "Headphones", icon: Headphones }, { value: "Layers", icon: Layers },
  { value: "Leaf", icon: Leaf }, { value: "Music", icon: Music }, { value: "Palette", icon: Palette },
  { value: "Plane", icon: Plane }, { value: "Power", icon: Power }, { value: "Gamepad", icon: Gamepad },
  { value: "Puzzle", icon: Puzzle }, { value: "Rainbow", icon: Rainbow }, { value: "Snowflake", icon: Snowflake },
  { value: "Telescope", icon: Telescope },
];

const COLOR_PRESETS = [
  { label: "Orange", gradient_from: "from-orange-700", gradient_to: "to-orange-500", text_color: "text-orange-700", bg_color: "bg-orange-100" },
  { label: "Amber", gradient_from: "from-amber-700", gradient_to: "to-amber-500", text_color: "text-amber-700", bg_color: "bg-amber-100" },
  { label: "Purple", gradient_from: "from-purple-500", gradient_to: "to-purple-400", text_color: "text-purple-600", bg_color: "bg-purple-100" },
  { label: "Cyan", gradient_from: "from-cyan-400", gradient_to: "to-blue-500", text_color: "text-cyan-600", bg_color: "bg-cyan-100" },
  { label: "Red", gradient_from: "from-red-500", gradient_to: "to-red-400", text_color: "text-red-600", bg_color: "bg-red-100" },
  { label: "Green", gradient_from: "from-green-500", gradient_to: "to-green-400", text_color: "text-green-600", bg_color: "bg-green-100" },
  { label: "Pink", gradient_from: "from-pink-500", gradient_to: "to-pink-400", text_color: "text-pink-600", bg_color: "bg-pink-100" },
  { label: "Blue", gradient_from: "from-blue-500", gradient_to: "to-blue-400", text_color: "text-blue-600", bg_color: "bg-blue-100" },
  { label: "Gold Luxe", gradient_from: "from-yellow-600", gradient_to: "to-amber-400", text_color: "text-yellow-700", bg_color: "bg-yellow-50" },
  { label: "Sunset", gradient_from: "from-orange-500", gradient_to: "to-rose-500", text_color: "text-orange-600", bg_color: "bg-orange-50" },
  { label: "Ocean", gradient_from: "from-blue-600", gradient_to: "to-cyan-400", text_color: "text-blue-700", bg_color: "bg-blue-50" },
  { label: "Neon", gradient_from: "from-fuchsia-500", gradient_to: "to-cyan-400", text_color: "text-fuchsia-600", bg_color: "bg-fuchsia-50" },
  { label: "Midnight", gradient_from: "from-indigo-800", gradient_to: "to-purple-500", text_color: "text-indigo-700", bg_color: "bg-indigo-50" },
  { label: "Lava", gradient_from: "from-red-700", gradient_to: "to-orange-400", text_color: "text-red-700", bg_color: "bg-red-50" },
  { label: "Berry", gradient_from: "from-purple-600", gradient_to: "to-pink-400", text_color: "text-purple-700", bg_color: "bg-purple-50" },
];

const iconMap: Record<string, LucideIcon> = Object.fromEntries(ICON_OPTIONS.map(i => [i.value, i.icon]));

interface CustomConfig {
  id?: string;
  display_name: string;
  icon_name: string;
  colorIndex: number;
  daily_credits: number;
  weekly_image_credits: number;
  model_access_tier: string;
  ai_price?: number | null;
  ai_reasoning?: string | null;
  status?: string;
}

const CustomVipBuilder = () => {
  const { toast } = useToast();
  const { tiers } = useVipTiers();
  const { balance: croinBalance, refetch: refetchCroins } = useCroins();
  const visibleTiers = tiers.filter(t => !(t as any).hidden);

  const [config, setConfig] = useState<CustomConfig>({
    display_name: "My Custom VIP",
    icon_name: "Crown",
    colorIndex: 0,
    daily_credits: 15,
    weekly_image_credits: 30,
    model_access_tier: visibleTiers[0]?.name || "bronze",
  });

  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [pricing, setPricing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Load existing custom VIP config
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingExisting(false); return; }
      
      const { data } = await supabase
        .from("custom_vip_configs" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const d = data as any;
        const colorIdx = COLOR_PRESETS.findIndex(c => c.gradient_from === d.gradient_from);
        setExistingConfig(d);
        setConfig({
          id: d.id,
          display_name: d.display_name,
          icon_name: d.icon_name,
          colorIndex: colorIdx >= 0 ? colorIdx : 0,
          daily_credits: d.daily_credits,
          weekly_image_credits: d.weekly_image_credits,
          model_access_tier: d.model_access_tier,
          ai_price: d.ai_price,
          ai_reasoning: d.ai_reasoning,
          status: d.status,
        });
      }
      setLoadingExisting(false);
    };
    load();
  }, []);

  const colorPreset = COLOR_PRESETS[config.colorIndex];
  const SelectedIcon = iconMap[config.icon_name] || Crown;

  const maxCredits = Math.max(...tiers.map(t => t.daily_credits), 50);
  const maxImageCredits = Math.max(...tiers.map(t => (t as any).weekly_image_credits || 30), 100);

  const handleSubmitForPricing = async () => {
    setPricing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      let configId = config.id;

      if (!configId) {
        // Create new config
        const { data, error } = await supabase
          .from("custom_vip_configs" as any)
          .insert({
            user_id: user.id,
            display_name: config.display_name,
            icon_name: config.icon_name,
            gradient_from: colorPreset.gradient_from,
            gradient_to: colorPreset.gradient_to,
            text_color: colorPreset.text_color,
            bg_color: colorPreset.bg_color,
            color_label: colorPreset.label,
            daily_credits: config.daily_credits,
            weekly_image_credits: config.weekly_image_credits,
            model_access_tier: config.model_access_tier,
          } as any)
          .select()
          .single();

        if (error) throw error;
        configId = (data as any).id;
      } else {
        // Update existing
        await supabase
          .from("custom_vip_configs" as any)
          .update({
            display_name: config.display_name,
            icon_name: config.icon_name,
            gradient_from: colorPreset.gradient_from,
            gradient_to: colorPreset.gradient_to,
            text_color: colorPreset.text_color,
            bg_color: colorPreset.bg_color,
            color_label: colorPreset.label,
            daily_credits: config.daily_credits,
            weekly_image_credits: config.weekly_image_credits,
            model_access_tier: config.model_access_tier,
            status: "pending",
          } as any)
          .eq("id", configId);
      }

      // Call pricing edge function
      const { data: priceData, error: priceError } = await supabase.functions.invoke("price-custom-vip", {
        body: { config_id: configId },
      });

      if (priceError || priceData?.error) {
        throw new Error(priceData?.error || "Pricing failed");
      }

      setConfig(prev => ({
        ...prev,
        id: configId!,
        ai_price: priceData.price,
        ai_reasoning: priceData.reasoning,
        status: "priced",
      }));
      setExistingConfig({ id: configId, status: "priced", ai_price: priceData.price });

      toast({
        title: "Price Set! 🤖",
        description: `AI priced your custom VIP at ¢${priceData.price}/month`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to get price", variant: "destructive" });
    } finally {
      setPricing(false);
    }
  };

  const handlePurchase = async () => {
    if (!config.id || !config.ai_price) return;
    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-custom-vip", {
        body: { config_id: config.id },
      });

      if (error || data?.error) {
        throw new Error(data?.error || "Purchase failed");
      }

      setConfig(prev => ({ ...prev, status: "active" }));
      await refetchCroins();

      toast({
        title: "Custom VIP Activated! 🎉",
        description: `Your "${config.display_name}" is active for 30 days at ¢${config.ai_price}/month.`,
      });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast({ title: "Purchase Failed", description: err.message || "Failed to purchase", variant: "destructive" });
    } finally {
      setPurchasing(false);
      setPurchaseDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!config.id) return;
    await supabase.from("custom_vip_configs" as any).delete().eq("id", config.id);
    setConfig({
      display_name: "My Custom VIP",
      icon_name: "Crown",
      colorIndex: 0,
      daily_credits: 15,
      weekly_image_credits: 30,
      model_access_tier: visibleTiers[0]?.name || "bronze",
    });
    setExistingConfig(null);
    toast({ title: "Deleted", description: "Custom VIP config removed." });
  };

  if (loadingExisting) return null;

  const isPriced = config.status === "priced" && config.ai_price;
  const isActive = config.status === "active";
  const canAfford = croinBalance !== null && config.ai_price != null && croinBalance >= config.ai_price;

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Build Your Custom VIP</CardTitle>
        </div>
        <CardDescription>Design your own VIP tier — AI sets the price!</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Preview */}
        <div className="flex items-center justify-center py-4">
          <div className="flex flex-col items-center gap-2">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${colorPreset.gradient_from} ${colorPreset.gradient_to} flex items-center justify-center shadow-lg`}>
              <SelectedIcon className="w-8 h-8 text-white drop-shadow" />
            </div>
            <span className={`font-bold text-sm ${colorPreset.text_color}`}>{config.display_name}</span>
            {isPriced && (
              <div className="flex items-center gap-1">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-bold text-yellow-500">¢{config.ai_price}/month</span>
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <div>
          <Label className="text-xs">Display Name</Label>
          <Input
            value={config.display_name}
            onChange={(e) => setConfig(p => ({ ...p, display_name: e.target.value, status: undefined, ai_price: null }))}
            maxLength={20}
            className="mt-1"
          />
        </div>

        {/* Icon Selection */}
        <div>
          <Label className="text-xs">Icon</Label>
          <div className="grid grid-cols-8 gap-1.5 mt-1 max-h-28 overflow-y-auto p-1">
            {ICON_OPTIONS.map(({ value, icon: Ic }) => (
              <button
                key={value}
                onClick={() => setConfig(p => ({ ...p, icon_name: value, status: undefined, ai_price: null }))}
                className={`p-1.5 rounded-md border transition-all ${
                  config.icon_name === value ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/50"
                }`}
              >
                <Ic className="w-4 h-4 mx-auto" />
              </button>
            ))}
          </div>
        </div>

        {/* Color Selection */}
        <div>
          <Label className="text-xs">Color Theme</Label>
          <div className="grid grid-cols-5 gap-1.5 mt-1">
            {COLOR_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => setConfig(p => ({ ...p, colorIndex: i, status: undefined, ai_price: null }))}
                className={`h-7 rounded-md bg-gradient-to-r ${preset.gradient_from} ${preset.gradient_to} transition-all ${
                  config.colorIndex === i ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                title={preset.label}
              />
            ))}
          </div>
        </div>

        {/* Credits Slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <Label className="text-xs">Daily Credits</Label>
            <span className="text-xs font-mono font-bold">{config.daily_credits}</span>
          </div>
          <Slider
            value={[config.daily_credits]}
            onValueChange={([v]) => setConfig(p => ({ ...p, daily_credits: v, status: undefined, ai_price: null }))}
            min={5}
            max={maxCredits}
            step={5}
          />
        </div>

        {/* Image Credits Slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <Label className="text-xs">Weekly Image Credits</Label>
            <span className="text-xs font-mono font-bold">{config.weekly_image_credits}</span>
          </div>
          <Slider
            value={[config.weekly_image_credits]}
            onValueChange={([v]) => setConfig(p => ({ ...p, weekly_image_credits: v, status: undefined, ai_price: null }))}
            min={5}
            max={maxImageCredits}
            step={5}
          />
        </div>

        {/* Model Access Tier */}
        <div>
          <Label className="text-xs">Model Access (same as tier)</Label>
          <Select
            value={config.model_access_tier}
            onValueChange={(v) => setConfig(p => ({ ...p, model_access_tier: v, status: undefined, ai_price: null }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleTiers.map(t => (
                <SelectItem key={t.name} value={t.name}>{t.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* AI Reasoning */}
        {isPriced && config.ai_reasoning && (
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <span className="font-medium">🤖 AI Pricing:</span> {config.ai_reasoning}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          {isActive ? (
            <Button disabled className="w-full">
              <Check className="w-4 h-4 mr-2" />
              Custom VIP Active
            </Button>
          ) : isPriced ? (
            <>
              <Button
                className="w-full"
                onClick={() => setPurchaseDialogOpen(true)}
                disabled={!canAfford}
              >
                <Coins className="w-4 h-4 mr-2" />
                {canAfford ? `Subscribe ¢${config.ai_price}/mo` : `Need ¢${config.ai_price}`}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete}>
                Start Over
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={handleSubmitForPricing}
              disabled={pricing || !config.display_name.trim()}
            >
              {pricing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI is pricing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Get AI Price Quote
                </>
              )}
            </Button>
          )}
          {config.id && !isActive && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
              Delete Custom Config
            </Button>
          )}
        </div>
      </CardContent>

      {/* Purchase Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Confirm Custom VIP
            </DialogTitle>
            <DialogDescription>
              Subscribe to <strong>{config.display_name}</strong> for{" "}
              <strong className="text-yellow-500">¢{config.ai_price}</strong>/month?
              <span className="block mt-2 text-xs">
                {config.daily_credits} daily credits, {config.weekly_image_credits} weekly image credits,
                {" "}{config.model_access_tier} tier model access. Auto-renews monthly.
              </span>
              {croinBalance !== null && config.ai_price && (
                <span className="block mt-1 text-xs">
                  Balance: ¢{croinBalance} → ¢{croinBalance - config.ai_price}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePurchase} disabled={purchasing}>
              {purchasing ? "Processing..." : "Confirm Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CustomVipBuilder;
