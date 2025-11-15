import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setConversations(data || []);
      
      // If no current conversation and we have conversations, select the most recent
      if (!currentConversationId && data && data.length > 0) {
        setCurrentConversationId(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async (title: string = 'New Chat') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title })
        .select()
        .single();

      if (error) throw error;

      setConversations(prev => [data, ...prev]);
      setCurrentConversationId(data.id);
      return data.id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== id));
      
      // If deleting current conversation, switch to another or create new
      if (currentConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        if (remaining.length > 0) {
          setCurrentConversationId(remaining[0].id);
        } else {
          setCurrentConversationId(null);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  const renameConversation = async (id: string, title: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', id);

      if (error) throw error;

      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, title } : c)
      );
    } catch (error) {
      console.error('Error renaming conversation:', error);
      toast({
        title: "Error",
        description: "Failed to rename conversation",
        variant: "destructive",
      });
    }
  };

  return {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createConversation,
    deleteConversation,
    renameConversation,
    loading,
    refetch: fetchConversations,
  };
};
