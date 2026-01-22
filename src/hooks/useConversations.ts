import { useState, useEffect, useCallback, useRef } from "react";
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
  const [currentConversationId, setCurrentConversationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const previousConversationIdRef = useRef<string | null>(null);

  // Check if a conversation has messages
  const checkHasMessages = async (conversationId: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    
    if (error) {
      console.error('Error checking messages:', error);
      return true; // Assume has messages on error to prevent accidental deletion
    }
    
    return (count ?? 0) > 0;
  };

  // Delete empty conversation silently
  const deleteEmptyConversation = async (id: string) => {
    const hasMsg = await checkHasMessages(id);
    if (!hasMsg) {
      await supabase.from('conversations').delete().eq('id', id);
      setConversations(prev => prev.filter(c => c.id !== id));
    }
  };

  // Wrapper for setCurrentConversationId that cleans up empty conversations
  const setCurrentConversationId = useCallback((newId: string | null) => {
    const oldId = previousConversationIdRef.current;
    
    // Set the new conversation immediately
    setCurrentConversationIdState(newId);
    previousConversationIdRef.current = newId;
    
    // Clean up old conversation if it's empty (and different from new)
    if (oldId && oldId !== newId) {
      deleteEmptyConversation(oldId);
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Filter out empty conversations
      const nonEmptyConversations: Conversation[] = [];
      for (const conv of data || []) {
        const hasMsg = await checkHasMessages(conv.id);
        if (hasMsg) {
          nonEmptyConversations.push(conv);
        } else {
          // Delete empty conversation from database
          await supabase.from('conversations').delete().eq('id', conv.id);
        }
      }

      setConversations(nonEmptyConversations);
      
      // If no current conversation and we have conversations, select the most recent
      if (!currentConversationId && nonEmptyConversations.length > 0) {
        setCurrentConversationIdState(nonEmptyConversations[0].id);
        previousConversationIdRef.current = nonEmptyConversations[0].id;
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [currentConversationId]);

  useEffect(() => {
    fetchConversations();
  }, []);

  const createConversation = async (title: string = 'New Chat') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Clean up current empty conversation before creating new one
      if (currentConversationId) {
        await deleteEmptyConversation(currentConversationId);
      }

      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title })
        .select()
        .single();

      if (error) throw error;

      setConversations(prev => [data, ...prev]);
      setCurrentConversationIdState(data.id);
      previousConversationIdRef.current = data.id;
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
          setCurrentConversationIdState(remaining[0].id);
          previousConversationIdRef.current = remaining[0].id;
        } else {
          setCurrentConversationIdState(null);
          previousConversationIdRef.current = null;
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
