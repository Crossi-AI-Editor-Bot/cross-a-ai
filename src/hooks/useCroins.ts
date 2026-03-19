import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useCroins = () => {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("croins-proxy", {
        body: { action: "balance" },
      });

      if (!error && data?.balance !== undefined) {
        setBalance(data.balance);
      } else {
        setBalance(null);
      }
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  const debit = async (amount: number, description: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("croins-proxy", {
        body: { action: "debit", amount, description },
      });

      if (error || data?.error) {
        return false;
      }

      await fetchBalance();
      return true;
    } catch {
      return false;
    }
  };

  return { balance, loading, debit, refetch: fetchBalance };
};
