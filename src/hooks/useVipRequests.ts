import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VipTier } from "./useVipStatus";

export interface VipRequest {
  id: string;
  user_id: string;
  requested_tier: VipTier;
  status: 'pending' | 'approved' | 'declined';
  admin_notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_email?: string;
  user_message?: string | null;
}

export const useVipRequests = (isAdmin: boolean = false) => {
  const [requests, setRequests] = useState<VipRequest[]>([]);
  const [userRequests, setUserRequests] = useState<VipRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user's own requests
      const { data: userReqs } = await supabase
        .from("vip_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (userReqs) {
        setUserRequests(userReqs as VipRequest[]);
      }

      // If admin, fetch all pending requests
      if (isAdmin) {
        const { data: allReqs } = await supabase
          .from("vip_requests")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true });

        if (allReqs) {
          // Get user emails from profiles
          const userIds = [...new Set(allReqs.map(r => r.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, email")
            .in("user_id", userIds);

          const emailMap = new Map(profiles?.map(p => [p.user_id, p.email]) || []);
          
          setRequests(allReqs.map(r => ({
            ...r,
            user_email: emailMap.get(r.user_id) || 'Unknown',
          })) as VipRequest[]);
        }
      }
    } catch (error) {
      console.error("Error fetching VIP requests:", error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const createRequest = async (tier: VipTier, message?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tier) return { error: "Not authenticated" };

      // Check for existing pending request
      const { data: existing } = await supabase
        .from("vip_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        return { error: "You already have a pending request" };
      }

      const { error } = await supabase
        .from("vip_requests")
        .insert({
          user_id: user.id,
          requested_tier: tier,
          user_message: message || null,
        });

      if (error) throw error;

      await fetchRequests();
      return { success: true };
    } catch (error: any) {
      console.error("Error creating VIP request:", error);
      return { error: error.message };
    }
  };

  const approveRequest = async (requestId: string, notes?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: "Not authenticated" };

      // Get the request details
      const { data: request } = await supabase
        .from("vip_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (!request) return { error: "Request not found" };

      // Update request status
      const { error: updateError } = await supabase
        .from("vip_requests")
        .update({
          status: "approved",
          admin_notes: notes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // Delete existing VIP status if user has one (for clean upgrade)
      const { data: existingVip } = await supabase
        .from("vip_status")
        .select("id")
        .eq("user_id", request.user_id)
        .maybeSingle();

      if (existingVip) {
        const { error: deleteError } = await supabase
          .from("vip_status")
          .delete()
          .eq("id", existingVip.id);

        if (deleteError) throw deleteError;
      }

      // Create new VIP status with the upgraded tier
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year from now

      const { error: vipError } = await supabase
        .from("vip_status")
        .insert({
          user_id: request.user_id,
          tier: request.requested_tier,
          expires_at: expiresAt.toISOString(),
        });

      if (vipError) throw vipError;

      await fetchRequests();
      return { success: true };
    } catch (error: any) {
      console.error("Error approving request:", error);
      return { error: error.message };
    }
  };

  const declineRequest = async (requestId: string, notes?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: "Not authenticated" };

      const { error } = await supabase
        .from("vip_requests")
        .update({
          status: "declined",
          admin_notes: notes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      await fetchRequests();
      return { success: true };
    } catch (error: any) {
      console.error("Error declining request:", error);
      return { error: error.message };
    }
  };

  return {
    requests,
    userRequests,
    loading,
    createRequest,
    approveRequest,
    declineRequest,
    refetch: fetchRequests,
  };
};
