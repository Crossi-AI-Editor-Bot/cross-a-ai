import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bot, LogOut, Trash2, Settings, Sparkles } from "lucide-react";
import AdventCalendar from "@/components/AdventCalendar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import ModelSelector, { type AIModel } from "@/components/ModelSelector";
import CreditsDisplay from "@/components/CreditsDisplay";
import { useModelCosts } from "@/hooks/useModelCosts";
import ConversationsList from "@/components/ConversationsList";
import MaintenancePage from "@/components/MaintenancePage";
import { useChat } from "@/hooks/useChat";
import { useCredits } from "@/hooks/useCredits";
import { useImageCredits } from "@/hooks/useImageCredits";
import { useConversations } from "@/hooks/useConversations";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { useVipStatus } from "@/hooks/useVipStatus";


const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createConversation,
    deleteConversation,
    renameConversation,
    loading: conversationsLoading,
    refetch: refetchConversations,
  } = useConversations();
  const { messages, isLoading, sendMessage, newCredits, newImageCredits, clearMessages } = useChat(currentConversationId, refetchConversations);
  const { credits, updateCredits, loading: creditsLoading } = useCredits();
  const { imageCredits, updateImageCredits, loading: imageCreditsLoading } = useImageCredits();
  const { modelCosts, loading: modelCostsLoading } = useModelCosts();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isDisabled, disabledUntil, loading: siteLoading } = useSiteStatus();
  const { tier: vipTier, loading: vipLoading } = useVipStatus();
  const [selectedModelCostId, setSelectedModelCostId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedModelRow = useMemo(
    () => (selectedModelCostId ? modelCosts.find((m) => m.id === selectedModelCostId) : undefined),
    [modelCosts, selectedModelCostId]
  );

  const selectedModelForChat = (selectedModelRow?.model_id as AIModel) ?? "google/gemini-2.5-flash";

  useEffect(() => {
    if (selectedModelCostId) return;
    const preferred =
      modelCosts.find((m) => m.enabled && m.model_id === "google/gemini-2.5-flash") ??
      modelCosts.find((m) => m.enabled);
    if (preferred) setSelectedModelCostId(preferred.id);
  }, [modelCosts, selectedModelCostId]);

  // Check authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (newCredits !== null) {
      updateCredits(newCredits);
    }
  }, [newCredits, updateCredits]);

  useEffect(() => {
    if (newImageCredits !== null) {
      updateImageCredits(newImageCredits);
    }
  }, [newImageCredits, updateImageCredits]);

  // Create initial conversation if none exists
  useEffect(() => {
    if (!conversationsLoading && conversations.length === 0 && user) {
      createConversation();
    }
  }, [conversationsLoading, conversations.length, user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleCreateConversation = async () => {
    await createConversation();
  };

  if (loading || creditsLoading || imageCreditsLoading || modelCostsLoading || conversationsLoading || siteLoading || adminLoading || vipLoading || !user) {
    return null;
  }

  // Show maintenance page if site is disabled (admins can bypass)
  if (isDisabled && !isAdmin) {
    return <MaintenancePage disabledUntil={disabledUntil} />;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ConversationsList
                conversations={conversations}
                currentConversationId={currentConversationId}
                onSelectConversation={setCurrentConversationId}
                onCreateConversation={handleCreateConversation}
                onDeleteConversation={deleteConversation}
                onRenameConversation={renameConversation}
              />
            </div>
            <div className="flex items-center gap-3">
              <ModelSelector models={modelCosts} value={selectedModelCostId} onChange={setSelectedModelCostId} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/vip")}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">VIP</span>
              </Button>
              <CreditsDisplay
                credits={credits}
                imageCredits={imageCredits}
                selectedModelCostId={selectedModelCostId}
                models={modelCosts}
              />
              <AdventCalendar onCreditsUpdate={(bonus) => updateCredits(credits + bonus)} />
              {isAdmin && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate("/admin")}
                  title="Admin Panel"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Clear chat history"
                    disabled={messages.length === 0}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your chat messages. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearMessages}>
                      Clear History
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12 animate-in fade-in duration-1000">
                <div className="inline-flex w-20 h-20 rounded-2xl bg-gradient-primary items-center justify-center mb-4 shadow-lg">
                  <Bot className="w-10 h-10 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Welcome to AI Chat
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Start a conversation with your AI assistant. Ask me anything!
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
                image={message.image}
                video={message.video}
                files={message.files}
              />
            ))}

            {isLoading && <TypingIndicator />}
            
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Input Area */}
      <footer className="border-t border-border bg-card/50 backdrop-blur-sm sticky bottom-0 shadow-lg">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <ChatInput 
            onSend={(content, files) => sendMessage(content, selectedModelForChat, files)} 
            disabled={isLoading} 
          />
        </div>
      </footer>
    </div>
  );
};

export default Index;
