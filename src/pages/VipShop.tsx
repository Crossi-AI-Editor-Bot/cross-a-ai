import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, X, Sparkles, Lock, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { VipTierIcon, VipTierBadge } from "@/components/VipTierIcon";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useVipRequests } from "@/hooks/useVipRequests";
import { useVipTiers } from "@/hooks/useVipTiers";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import VipAdminRequests from "@/components/VipAdminRequests";
import VipTierComparisonChart from "@/components/VipTierComparisonChart";
import { supabase } from "@/integrations/supabase/client";

const VipShop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tier: currentTier, loading: vipLoading, hasTierAccess } = useVipStatus();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { userRequests, createRequest, loading: requestsLoading } = useVipRequests(isAdmin);
  const { tiers, tierNames, getRequiredTierFor, loading: tiersLoading } = useVipTiers();
  const [requestingTier, setRequestingTier] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);

  // Filter out hidden tiers from display
  const visibleTiers = tiers.filter((t) => !(t as any).hidden);

  const pendingRequest = userRequests.find(r => r.status === 'pending');

  const canRequestTier = (tierName: string): boolean => {
    const requiredTier = getRequiredTierFor(tierName);
    if (!requiredTier) return true;
    return hasTierAccess(requiredTier);
  };

  const openRequestDialog = (tierName: string) => {
    setSelectedTier(tierName);
    setRequestMessage("");
    setDialogOpen(true);
  };

  const handleRequestTier = async () => {
    if (!selectedTier) return;

    if (pendingRequest) {
      toast({
        title: "Request pending",
        description: "You already have a pending VIP request. Please wait for admin review.",
        variant: "destructive",
      });
      setDialogOpen(false);
      return;
    }

    setRequestingTier(selectedTier);
    const result = await createRequest(selectedTier, requestMessage);
    setRequestingTier(null);
    setDialogOpen(false);

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Request submitted!", description: "Your VIP request has been sent to the admin for review." });
    }
  };

  const getRequestStatus = (tierName: string) => {
    const request = userRequests.find(r => r.requested_tier === tierName);
    return request?.status || null;
  };

  if (vipLoading || adminLoading || requestsLoading || tiersLoading) {
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
            {currentTier && <VipTierBadge tier={currentTier} />}
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* Upgrade Path */}
        <Card className="mb-8 bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Upgrade Path</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {visibleTiers.map((tier, i) => (
                  <div key={tier.name} className="flex items-center gap-2">
                    <span className={`capitalize text-sm font-medium ${currentTier === tier.name ? 'text-primary' : 'text-muted-foreground'}`}>
                      {tier.display_name}
                    </span>
                    {i < visibleTiers.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {pendingRequest && (
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-medium">Pending Request</p>
                  <p className="text-sm text-muted-foreground">
                    Your request for <span className="capitalize font-medium">{pendingRequest.requested_tier}</span> tier is awaiting admin approval.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-12">
          <VipTierComparisonChart />
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {visibleTiers.map((tier) => {
            const isCurrentTier = currentTier === tier.name;
            const status = getRequestStatus(tier.name);
            const isPending = status === 'pending';
            const isDeclined = status === 'declined';
            const canRequest = canRequestTier(tier.name);
            const requiredTier = getRequiredTierFor(tier.name);
            const alreadyHas = hasTierAccess(tier.name);
            const requiredTierConfig = requiredTier ? tiers.find(t => t.name === requiredTier) : null;

            return (
              <Card 
                key={tier.name} 
                className={`relative transition-all hover:shadow-lg ${
                  isCurrentTier ? 'ring-2 ring-primary' : ''
                } ${!canRequest && !alreadyHas ? 'opacity-60' : ''}`}
              >
                {isCurrentTier && (
                  <Badge className="absolute -top-2 -right-2 bg-primary">Current</Badge>
                )}
                {!canRequest && !alreadyHas && (
                  <Badge variant="secondary" className="absolute -top-2 -right-2">
                    <Lock className="w-3 h-3 mr-1" />Locked
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <VipTierIcon tier={tier.name} size="xl" className="mx-auto mb-2" />
                  <CardTitle>{tier.display_name}</CardTitle>
                  <CardDescription>
                    {tier.daily_credits} credits/day
                    {requiredTierConfig ? ` · Requires ${requiredTierConfig.display_name}` : ' · Entry level'}
                  </CardDescription>
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
                  </ul>

                  {alreadyHas ? (
                    <Button className="w-full" disabled>
                      {isCurrentTier ? 'Active' : 'Unlocked'}
                    </Button>
                  ) : !canRequest ? (
                    <Button className="w-full" variant="outline" disabled>
                      <Lock className="w-4 h-4 mr-2" />
                      Need {requiredTierConfig?.display_name}
                    </Button>
                  ) : isPending ? (
                    <Button className="w-full" variant="outline" disabled>
                      <Clock className="w-4 h-4 mr-2" />Pending
                    </Button>
                  ) : isDeclined ? (
                    <Button className="w-full" variant="outline" onClick={() => openRequestDialog(tier.name)} disabled={!!pendingRequest}>
                      Request Again
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={() => openRequestDialog(tier.name)} disabled={!!pendingRequest}>
                      Request
                    </Button>
                  )}

                  {isDeclined && (
                    <p className="text-xs text-red-500 mt-2 text-center flex items-center justify-center gap-1">
                      <X className="w-3 h-3" />Previous request declined
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Request {selectedTier && <span className="capitalize">{selectedTier}</span>} VIP
            </DialogTitle>
            <DialogDescription>
              Tell us why you'd like to become a {selectedTier} VIP member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message (optional)</label>
              <Textarea
                placeholder="Why would you like VIP access? (optional)"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRequestTier} disabled={requestingTier !== null}>
              {requestingTier ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VipShop;
