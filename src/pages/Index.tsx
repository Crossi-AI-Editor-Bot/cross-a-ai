import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bot, LogOut, Trash2 } from "lucide-react";
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
import { useChat } from "@/hooks/useChat";
import { useCredits } from "@/hooks/useCredits";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { messages, isLoading, sendMessage, newCredits, clearMessages } = useChat();
  const { credits, updateCredits, loading: creditsLoading } = useCredits();
  const [selectedModel, setSelectedModel] = useState<AIModel>("google/gemini-2.5-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading || creditsLoading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-md">
                <Bot className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">AI Chat</h1>
                <p className="text-sm text-muted-foreground">Your intelligent assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              <CreditsDisplay credits={credits} />
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
              <ChatMessage key={index} role={message.role} content={message.content} />
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
            onSend={(content) => sendMessage(content, selectedModel)} 
            disabled={isLoading} 
          />
        </div>
      </footer>
    </div>
  );
};

export default Index;
