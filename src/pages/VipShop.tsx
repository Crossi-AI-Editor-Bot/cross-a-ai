import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, X, Sparkles, Ticket, Coins, MessageSquare, Mic, Image as ImageIcon, Video, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { VipTierIcon, VipTierBadge } from "@/components/VipTierIcon";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useVipTiers } from "@/hooks/useVipTiers";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCroins } from "@/hooks/useCroins";
import { useModelCosts } from "@/hooks/useModelCosts";
import VipAdminRequests from "@/components/VipAdminRequests";
import VipTierComparisonChart from "@/components/VipTierComparisonChart";
import CustomVipBuilder from "@/components/CustomVipBuilder";
import CreditPurchaseSection from "@/components/CreditPurchaseSection";
import { supabase } from "@/integrations/supabase/client";

const VipShop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tier: currentTier, loading: vipLoading, hasTierAccess } = useVipStatus();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { tiers, loading: tiersLoading } = useVipTiers();
  const { balance: croinBalance, loading: croinsLoading, refetch: refetchCroins } = useCroins();
  const { modelCosts } = useModelCosts();
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dynamicDialogOpen, setDynamicDialogOpen] = useState(false);
  const [dynamicCeilingTier, setDynamicCeilingTier] = useState<string>("");
  const [dynamicSelectedIds, setDynamicSelectedIds] = useState<string[]>([]);

  const visibleTiers = tiers.filter((t) => !(t as any).hidden);

  const openPurchaseDialog = (tierName: string) => {
    setSelectedTier(tierName);
    const tier = tiers.find(t => t.name === tierName);
    if ((tier as any)?.is_dynamic) {
      setDynamicCeilingTier("");
      setDynamicSelectedIds([]);
      setDynamicDialogOpen(true);
    } else {
      setPurchaseDialogOpen(true);
    }
  };

  // Models eligible for the currently chosen dynamic ceiling tier
  const dynamicEligibleModels = useMemo(() => {
    if (!dynamicCeilingTier) return [];
    const tierOrder = tiers.map(t => t.name);
    const ceilingIdx = tierOrder.indexOf(dynamicCeilingTier);
    if (ceilingIdx < 0) return [];
    return modelCosts.filter((m) => {
      if (!m.enabled) return false;
      if (m.public_access) return true;
      // include a model if any tier at or below the ceiling grants access
      return tierOrder.slice(0, ceilingIdx + 1).some((n) => m.tier_access?.[n]);
    });
  }, [dynamicCeilingTier, modelCosts, tiers]);

  const handlePurchaseWithCroins = async () => {
    if (!selectedTier) return;
    const tier = tiers.find(t => t.name === selectedTier);
    if (!tier || !(tier as any).croin_price) return;

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-vip", {
        body: {
          tier_name: selectedTier,
          dynamic_ceiling_tier: (tier as any).is_dynamic ? dynamicCeilingTier : undefined,
          dynamic_model_ids: (tier as any).is_dynamic ? dynamicSelectedIds : undefined,
        },
      });

      if (error || data?.error) {
        toast({
          title: "Purchase Failed",
          description: data?.error || "Insufficient Croins or payment error.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "VIP Purchased! 🎉",
        description: `${tier.display_name} tier activated for 30 days at ¢${(tier as any).croin_price}/month.`,
      });
      await refetchCroins();
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast({ title: "Error", description: "Purchase failed.", variant: "destructive" });
    } finally {
      setPurchasing(false);
      setPurchaseDialogOpen(false);
      setDynamicDialogOpen(false);
    }
  };

  if (vipLoading || adminLoading || tiersLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-bold">VIP Shop</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {croinBalance !== null && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 rounded-lg">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-semibold text-yellow-500">¢{croinBalance}</span>
                </div>
              )}
              {currentTier && <VipTierBadge tier={currentTier} />}
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <VipTierComparisonChart />
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {visibleTiers.map((tier) => {
            const isCurrentTier = currentTier === tier.name;
            const alreadyHas = hasTierAccess(tier.name);
            const croinPrice = (tier as any).croin_price || 0;
            const canAfford = croinBalance !== null && croinBalance >= croinPrice;

            return (
              <Card 
                key={tier.name} 
                className={`relative transition-all hover:shadow-lg ${
                  isCurrentTier ? 'ring-2 ring-primary' : ''
                }`}
              >
                {isCurrentTier && (
                  <Badge className="absolute -top-2 -right-2 bg-primary">Current</Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <VipTierIcon tier={tier.name} size="xl" className="mx-auto mb-2" />
                  <CardTitle>{tier.display_name}</CardTitle>
                  <CardDescription>
                    {tier.daily_credits} credits/day
                  </CardDescription>
                  {croinPrice > 0 && (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-bold text-yellow-500">¢{croinPrice}/month</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{tier.daily_credits} daily credits</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Access to {tier.display_name}-tier models</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Auto-renews monthly</span>
                    </li>
                  </ul>

                  {isCurrentTier ? (
                    <div className="space-y-2">
                      <Button className="w-full" disabled>
                        Active
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setCancelDialogOpen(true)}
                        size="sm"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel Subscription
                      </Button>
                    </div>
                  ) : croinPrice > 0 ? (
                    <Button
                      className="w-full"
                      onClick={() => openPurchaseDialog(tier.name)}
                      disabled={!canAfford || purchasing}
                    >
                      {(tier as any).is_dynamic ? <Zap className="w-4 h-4 mr-2" /> : <Coins className="w-4 h-4 mr-2" />}
                      {canAfford
                        ? ((tier as any).is_dynamic ? `Configure ¢${croinPrice}/mo` : `Subscribe ¢${croinPrice}/mo`)
                        : `Need ¢${croinPrice}`}
                    </Button>
                  ) : (
                    <Button className="w-full" disabled variant="outline">
                      Price not set
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Custom VIP Builder */}
        <div className="mb-8">
          <CustomVipBuilder />
        </div>

        {/* Invite Code Redemption */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Ticket className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Have an invite code?</h3>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Enter invite code (e.g. XXXX-XXXX-XXXX)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={14}
              />
              <Button
                onClick={async () => {
                  if (!inviteCode.trim()) return;
                  setRedeemingCode(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("redeem-invite-code", {
                      body: { code: inviteCode.trim() },
                    });
                    if (error || data?.error) {
                      toast({ title: "Invalid code", description: data?.error || "Could not redeem code.", variant: "destructive" });
                    } else {
                      toast({ title: "VIP Activated! 🎉", description: `You are now a ${data.tier} VIP member!` });
                      setInviteCode("");
                      window.location.reload();
                    }
                  } catch {
                    toast({ title: "Error", description: "Failed to redeem code.", variant: "destructive" });
                  } finally {
                    setRedeemingCode(false);
                  }
                }}
                disabled={redeemingCode || !inviteCode.trim()}
              >
                {redeemingCode ? "Redeeming..." : "Redeem"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && <VipAdminRequests />}

        <CreditPurchaseSection croinBalance={croinBalance} refetchCroins={refetchCroins} />
      </main>

      {/* Cancel Subscription Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="w-5 h-5 text-destructive" />
              Cancel VIP Subscription
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your VIP subscription? You'll keep access until the current period expires, but it won't renew.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Subscription</Button>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) throw new Error("Not logged in");
                  const { error } = await supabase
                    .from("vip_status")
                    .delete()
                    .eq("user_id", user.id);
                  if (error) throw error;
                  toast({ title: "Subscription Cancelled", description: "Your VIP has been cancelled. You can re-subscribe anytime." });
                  setTimeout(() => window.location.reload(), 1000);
                } catch {
                  toast({ title: "Error", description: "Failed to cancel subscription.", variant: "destructive" });
                } finally {
                  setCancelling(false);
                  setCancelDialogOpen(false);
                }
              }}
            >
              {cancelling ? "Cancelling..." : "Yes, Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Confirmation Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Confirm Subscription
            </DialogTitle>
            <DialogDescription>
              {selectedTier && (() => {
                const tier = tiers.find(t => t.name === selectedTier);
                return tier ? (
                  <>
                    Subscribe to <strong>{tier.display_name}</strong> VIP for{" "}
                    <strong className="text-yellow-500">¢{(tier as any).croin_price}</strong>/month?
                    <span className="block mt-2 text-xs">
                      You'll be charged ¢{(tier as any).croin_price} now and automatically every 30 days. 
                      If you don't have enough Croins at renewal, your VIP will be cancelled.
                    </span>
                    {croinBalance !== null && (
                      <span className="block mt-1 text-xs">
                        Your balance: ¢{croinBalance} → ¢{croinBalance - ((tier as any).croin_price || 0)}
                      </span>
                    )}
                  </>
                ) : null;
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePurchaseWithCroins} disabled={purchasing}>
              {purchasing ? "Processing..." : "Confirm Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VipShop;
