import { useState } from "react";
import { Plus, Trash2, GripVertical, Save, Crown, Gem, Star, Award, Coins, Hexagon, Shield, Zap, Heart, Flame, Diamond, Sparkles, Trophy, Medal, Rocket, Target, Sun, Moon, Globe, Key, Lock, Unlock, Bell, Bookmark, Camera, Clock, Cloud, Compass, Coffee, Eye, Feather, Flag, Gift, Headphones, Home, Layers, Leaf, LifeBuoy, Link, Map, MapPin, MessageCircle, Mic, Monitor, Music, Package, Palette, PenTool, Phone, Plane, Power, Radio, RefreshCw, Scissors, Search, Send, Server, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sliders, Smartphone, Speaker, Swords, Tag, Terminal, ThumbsUp, Truck, Tv, Umbrella, Upload, Users, Video, Wifi, Wind, Wrench, X, Activity, Airplay, AlertTriangle, Anchor, Archive, AtSign, BarChart, Battery, BellRing, Bluetooth, Bold, Box, Briefcase, Bug, Building, Cake, Calculator, Calendar, Cat, Check, ChevronRight, CircleDot, Clapperboard, CloudLightning, Code, Cpu, CreditCard, Database, Dog, Fingerprint, Fish, FlaskConical, Flower, Footprints, Gamepad, Glasses, Grape, Guitar, Hammer, HandMetal, Hash, Infinity, Joystick, Landmark, Laugh, Magnet, Megaphone, Mountain, Paintbrush, PartyPopper, Pencil, PiggyBank, Pizza, Plug, Popcorn, Puzzle, Rainbow, Receipt, ScanFace, Shell, Ship, Skull, Snowflake, Sparkle, Stamp, Stethoscope, Sunrise, Telescope, Tent, Timer, ToyBrick, TreePine, UtensilsCrossed, Wand2, Waves, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  { value: "Crown", label: "Crown" }, { value: "Gem", label: "Gem" }, { value: "Star", label: "Star" },
  { value: "Award", label: "Award" }, { value: "Coins", label: "Coins" }, { value: "Hexagon", label: "Hexagon" },
  { value: "Shield", label: "Shield" }, { value: "Zap", label: "Zap" }, { value: "Heart", label: "Heart" },
  { value: "Flame", label: "Flame" }, { value: "Diamond", label: "Diamond" }, { value: "Sparkles", label: "Sparkles" },
  { value: "Trophy", label: "Trophy" }, { value: "Medal", label: "Medal" }, { value: "Rocket", label: "Rocket" },
  { value: "Target", label: "Target" }, { value: "Sun", label: "Sun" }, { value: "Moon", label: "Moon" },
  { value: "Globe", label: "Globe" }, { value: "Key", label: "Key" }, { value: "Lock", label: "Lock" },
  { value: "Unlock", label: "Unlock" }, { value: "Bell", label: "Bell" }, { value: "Bookmark", label: "Bookmark" },
  { value: "Camera", label: "Camera" }, { value: "Clock", label: "Clock" }, { value: "Cloud", label: "Cloud" },
  { value: "Compass", label: "Compass" }, { value: "Coffee", label: "Coffee" }, { value: "Eye", label: "Eye" },
  { value: "Feather", label: "Feather" }, { value: "Flag", label: "Flag" }, { value: "Gift", label: "Gift" },
  { value: "Headphones", label: "Headphones" }, { value: "Home", label: "Home" }, { value: "Layers", label: "Layers" },
  { value: "Leaf", label: "Leaf" }, { value: "LifeBuoy", label: "LifeBuoy" }, { value: "Link", label: "Link" },
  { value: "Map", label: "Map" }, { value: "MapPin", label: "MapPin" }, { value: "MessageCircle", label: "MessageCircle" },
  { value: "Mic", label: "Mic" }, { value: "Monitor", label: "Monitor" }, { value: "Music", label: "Music" },
  { value: "Package", label: "Package" }, { value: "Palette", label: "Palette" }, { value: "PenTool", label: "PenTool" },
  { value: "Phone", label: "Phone" }, { value: "Plane", label: "Plane" }, { value: "Power", label: "Power" },
  { value: "Radio", label: "Radio" }, { value: "RefreshCw", label: "RefreshCw" }, { value: "Scissors", label: "Scissors" },
  { value: "Search", label: "Search" }, { value: "Send", label: "Send" }, { value: "Server", label: "Server" },
  { value: "Settings", label: "Settings" }, { value: "ShieldCheck", label: "ShieldCheck" }, { value: "ShoppingBag", label: "ShoppingBag" },
  { value: "ShoppingCart", label: "ShoppingCart" }, { value: "Sliders", label: "Sliders" }, { value: "Smartphone", label: "Smartphone" },
  { value: "Speaker", label: "Speaker" }, { value: "Swords", label: "Swords" }, { value: "Tag", label: "Tag" },
  { value: "Terminal", label: "Terminal" }, { value: "ThumbsUp", label: "ThumbsUp" }, { value: "Truck", label: "Truck" },
  { value: "Tv", label: "Tv" }, { value: "Umbrella", label: "Umbrella" }, { value: "Upload", label: "Upload" },
  { value: "Users", label: "Users" }, { value: "Video", label: "Video" }, { value: "Wifi", label: "Wifi" },
  { value: "Wind", label: "Wind" }, { value: "Wrench", label: "Wrench" }, { value: "Activity", label: "Activity" },
  { value: "Airplay", label: "Airplay" }, { value: "AlertTriangle", label: "AlertTriangle" }, { value: "Anchor", label: "Anchor" },
  { value: "Archive", label: "Archive" }, { value: "AtSign", label: "AtSign" }, { value: "BarChart", label: "BarChart" },
  { value: "Battery", label: "Battery" }, { value: "BellRing", label: "BellRing" }, { value: "Bluetooth", label: "Bluetooth" },
  { value: "Bold", label: "Bold" }, { value: "Box", label: "Box" }, { value: "Briefcase", label: "Briefcase" },
  { value: "Bug", label: "Bug" }, { value: "Building", label: "Building" }, { value: "Cake", label: "Cake" },
  { value: "Calculator", label: "Calculator" }, { value: "Calendar", label: "Calendar" }, { value: "Cat", label: "Cat" },
  { value: "Check", label: "Check" }, { value: "ChevronRight", label: "ChevronRight" }, { value: "CircleDot", label: "CircleDot" },
  { value: "Clapperboard", label: "Clapperboard" }, { value: "CloudLightning", label: "CloudLightning" }, { value: "Code", label: "Code" },
  { value: "Cpu", label: "Cpu" }, { value: "CreditCard", label: "CreditCard" }, { value: "Database", label: "Database" },
  { value: "Dog", label: "Dog" }, { value: "Fingerprint", label: "Fingerprint" }, { value: "Fish", label: "Fish" },
  { value: "FlaskConical", label: "FlaskConical" }, { value: "Flower", label: "Flower" }, { value: "Footprints", label: "Footprints" },
  { value: "Gamepad", label: "Gamepad" }, { value: "Glasses", label: "Glasses" }, { value: "Grape", label: "Grape" },
  { value: "Guitar", label: "Guitar" }, { value: "Hammer", label: "Hammer" }, { value: "HandMetal", label: "HandMetal" },
  { value: "Hash", label: "Hash" }, { value: "Infinity", label: "Infinity" }, { value: "Joystick", label: "Joystick" },
  { value: "Landmark", label: "Landmark" }, { value: "Laugh", label: "Laugh" }, { value: "Magnet", label: "Magnet" },
  { value: "Megaphone", label: "Megaphone" }, { value: "Mountain", label: "Mountain" }, { value: "Paintbrush", label: "Paintbrush" },
  { value: "PartyPopper", label: "PartyPopper" }, { value: "Pencil", label: "Pencil" }, { value: "PiggyBank", legacyKey: "PiggyBank" }, { value: "Pizza", label: "Pizza" }, { value: "Plug", label: "Plug" }, { value: "Popcorn", label: "Popcorn" },
  { value: "Puzzle", label: "Puzzle" }, { value: "Rainbow", label: "Rainbow" }, { value: "Receipt", label: "Receipt" },
  { value: "ScanFace", label: "ScanFace" }, { value: "Shell", label: "Shell" }, { value: "Ship", label: "Ship" },
  { value: "Skull", label: "Skull" }, { value: "Snowflake", label: "Snowflake" }, { value: "Sparkle", label: "Sparkle" },
  { value: "Stamp", label: "Stamp" }, { value: "Stethoscope", label: "Stethoscope" }, { value: "Sunrise", label: "Sunrise" },
  { value: "Telescope", label: "Telescope" }, { value: "Tent", label: "Tent" }, { value: "Timer", label: "Timer" },
  { value: "ToyBrick", label: "ToyBrick" }, { value: "TreePine", label: "TreePine" }, { value: "UtensilsCrossed", label: "UtensilsCrossed" },
  { value: "Wand2", label: "Wand2" }, { value: "Waves", label: "Waves" },
];

const iconMap: Record<string, typeof Crown> = {
  Crown, Gem, Star, Award, Coins, Hexagon, Shield, Zap, Heart, Flame, Diamond, Sparkles,
  Trophy, Medal, Rocket, Target, Sun, Moon, Globe, Key, Lock, Unlock, Bell, Bookmark,
  Camera, Clock, Cloud, Compass, Coffee, Eye, Feather, Flag, Gift, Headphones, Home, Layers,
  Leaf, LifeBuoy, Link, Map, MapPin, MessageCircle, Mic, Monitor, Music, Package, Palette,
  PenTool, Phone, Plane, Power, Radio, RefreshCw, Scissors, Search, Send, Server, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Sliders, Smartphone, Speaker, Swords, Tag, Terminal,
  ThumbsUp, Truck, Tv, Umbrella, Upload, Users, Video, Wifi, Wind, Wrench, Activity, Airplay,
  AlertTriangle, Anchor, Archive, AtSign, BarChart, Battery, BellRing, Bluetooth, Bold, Box,
  Briefcase, Bug, Building, Cake, Calculator, Calendar, Cat, Check, ChevronRight, CircleDot,
  Clapperboard, CloudLightning, Code, Cpu, CreditCard, Database, Dog, Fingerprint, Fish,
  FlaskConical, Flower, Footprints, Gamepad, Glasses, Grape, Guitar, Hammer, HandMetal, Hash,
  Infinity, Joystick, Landmark, Laugh, Magnet, Megaphone, Mountain, Paintbrush, PartyPopper,
  Pencil, PiggyBank, Pizza, Plug, Popcorn, Puzzle, Rainbow, Receipt, ScanFace, Shell, Ship,
  Skull, Snowflake, Sparkle, Stamp, Stethoscope, Sunrise, Telescope, Tent, Timer, ToyBrick,
  TreePine, UtensilsCrossed, Wand2, Waves,
};

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
  { label: "Indigo", gradient_from: "from-indigo-500", gradient_to: "to-indigo-400", text_color: "text-indigo-600", bg_color: "bg-indigo-100", color: "indigo-500" },
  { label: "Violet", gradient_from: "from-violet-500", gradient_to: "to-violet-400", text_color: "text-violet-600", bg_color: "bg-violet-100", color: "violet-500" },
  { label: "Fuchsia", gradient_from: "from-fuchsia-500", gradient_to: "to-fuchsia-400", text_color: "text-fuchsia-600", bg_color: "bg-fuchsia-100", color: "fuchsia-500" },
  { label: "Rose", gradient_from: "from-rose-500", gradient_to: "to-rose-400", text_color: "text-rose-600", bg_color: "bg-rose-100", color: "rose-500" },
  { label: "Teal", gradient_from: "from-teal-500", gradient_to: "to-teal-400", text_color: "text-teal-600", bg_color: "bg-teal-100", color: "teal-500" },
  { label: "Lime", gradient_from: "from-lime-500", gradient_to: "to-lime-400", text_color: "text-lime-600", bg_color: "bg-lime-100", color: "lime-500" },
  { label: "Sky", gradient_from: "from-sky-500", gradient_to: "to-sky-400", text_color: "text-sky-600", bg_color: "bg-sky-100", color: "sky-500" },
  { label: "Blue", gradient_from: "from-blue-500", gradient_to: "to-blue-400", text_color: "text-blue-600", bg_color: "bg-blue-100", color: "blue-500" },
  { label: "Stone", gradient_from: "from-stone-500", gradient_to: "to-stone-400", text_color: "text-stone-600", bg_color: "bg-stone-100", color: "stone-500" },
  { label: "Zinc", gradient_from: "from-zinc-500", gradient_to: "to-zinc-400", text_color: "text-zinc-600", bg_color: "bg-zinc-100", color: "zinc-500" },
  { label: "Neutral", gradient_from: "from-neutral-500", gradient_to: "to-neutral-400", text_color: "text-neutral-600", bg_color: "bg-neutral-100", color: "neutral-500" },
  { label: "Gold Luxe", gradient_from: "from-yellow-600", gradient_to: "to-amber-400", text_color: "text-yellow-700", bg_color: "bg-yellow-50", color: "yellow-600" },
  { label: "Sunset", gradient_from: "from-orange-500", gradient_to: "to-rose-500", text_color: "text-orange-600", bg_color: "bg-orange-50", color: "orange-500" },
  { label: "Ocean", gradient_from: "from-blue-600", gradient_to: "to-cyan-400", text_color: "text-blue-700", bg_color: "bg-blue-50", color: "blue-600" },
  { label: "Forest", gradient_from: "from-green-700", gradient_to: "to-emerald-400", text_color: "text-green-700", bg_color: "bg-green-50", color: "green-700" },
  { label: "Neon", gradient_from: "from-fuchsia-500", gradient_to: "to-cyan-400", text_color: "text-fuchsia-600", bg_color: "bg-fuchsia-50", color: "fuchsia-500" },
  { label: "Midnight", gradient_from: "from-indigo-800", gradient_to: "to-purple-500", text_color: "text-indigo-700", bg_color: "bg-indigo-50", color: "indigo-800" },
  { label: "Lava", gradient_from: "from-red-700", gradient_to: "to-orange-400", text_color: "text-red-700", bg_color: "bg-red-50", color: "red-700" },
  { label: "Arctic", gradient_from: "from-sky-300", gradient_to: "to-blue-600", text_color: "text-sky-700", bg_color: "bg-sky-50", color: "sky-300" },
  { label: "Berry", gradient_from: "from-purple-600", gradient_to: "to-pink-400", text_color: "text-purple-700", bg_color: "bg-purple-50", color: "purple-600" },
  { label: "Charcoal", gradient_from: "from-gray-800", gradient_to: "to-gray-500", text_color: "text-gray-700", bg_color: "bg-gray-100", color: "gray-800" },
];

interface EditingTier {
  id?: string;
  name: string;
  display_name: string;
  daily_credits: number;
  weekly_image_credits: number;
  monthly_video_credits: number;
  weekly_audio_credits: number;
  croin_price: number;
  sort_order: number;
  icon_name: string;
  colorPresetIndex: number;
  hidden: boolean;
  unlimited: boolean;
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
      weekly_image_credits: (tier as any).weekly_image_credits ?? 30,
      monthly_video_credits: (tier as any).monthly_video_credits ?? 5,
      weekly_audio_credits: (tier as any).weekly_audio_credits ?? 10,
      croin_price: (tier as any).croin_price ?? 0,
      sort_order: tier.sort_order,
      icon_name: tier.icon_name,
      colorPresetIndex: findColorPresetIndex(tier),
      hidden: tier.hidden || false,
      unlimited: (tier as any).unlimited === true,
    });
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setEditingTier({
      name: "",
      display_name: "",
      daily_credits: 15,
      weekly_image_credits: 30,
      monthly_video_credits: 5,
      weekly_audio_credits: 10,
      croin_price: 0,
      sort_order: (tiers.length + 1) * 10,
      icon_name: "Crown",
      colorPresetIndex: 0,
      hidden: false,
      unlimited: false,
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
      weekly_image_credits: editingTier.weekly_image_credits,
      monthly_video_credits: editingTier.monthly_video_credits,
      weekly_audio_credits: editingTier.weekly_audio_credits,
      croin_price: editingTier.croin_price,
      sort_order: editingTier.sort_order,
      icon_name: editingTier.icon_name,
      color: preset.color,
      gradient_from: preset.gradient_from,
      gradient_to: preset.gradient_to,
      text_color: preset.text_color,
      bg_color: preset.bg_color,
      hidden: editingTier.hidden,
      unlimited: editingTier.unlimited,
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
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {tier.display_name}
                      {(tier as any).hidden && <Badge variant="secondary" className="text-[10px] px-1 py-0">Hidden</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tier.daily_credits} cr/day · {(tier as any).weekly_image_credits ?? 30} img/wk · {(tier as any).monthly_video_credits ?? 5} vid/mo · {(tier as any).weekly_audio_credits ?? 10} aud/wk · Order: {tier.sort_order}
                    </p>
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
                  <label className="text-xs text-muted-foreground">Daily Chat Credits</label>
                  <Input
                    type="number"
                    value={editingTier.daily_credits}
                    onChange={(e) => setEditingTier({ ...editingTier, daily_credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Weekly Image Credits</label>
                  <Input
                    type="number"
                    value={editingTier.weekly_image_credits}
                    onChange={(e) => setEditingTier({ ...editingTier, weekly_image_credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Monthly Video Credits</label>
                  <Input
                    type="number"
                    value={editingTier.monthly_video_credits}
                    onChange={(e) => setEditingTier({ ...editingTier, monthly_video_credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Weekly Audio Credits</label>
                  <Input
                    type="number"
                    value={editingTier.weekly_audio_credits}
                    onChange={(e) => setEditingTier({ ...editingTier, weekly_audio_credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Croin Price (¢)</label>
                  <Input
                    type="number"
                    value={editingTier.croin_price}
                    onChange={(e) => setEditingTier({ ...editingTier, croin_price: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                    min={0}
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

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tier-hidden"
                    checked={editingTier.hidden}
                    onChange={(e) => setEditingTier({ ...editingTier, hidden: e.target.checked })}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <label htmlFor="tier-hidden" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                    <EyeOff className="w-3 h-3" />
                    Hidden (invite code only)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tier-unlimited"
                    checked={editingTier.unlimited}
                    onChange={(e) => setEditingTier({ ...editingTier, unlimited: e.target.checked })}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <label htmlFor="tier-unlimited" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                    <Infinity className="w-3 h-3" />
                    Unlimited (no credit or media credit limits)
                  </label>
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
