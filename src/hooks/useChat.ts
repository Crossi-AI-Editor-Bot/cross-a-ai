import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  isPuterImageModel,
  generatePuterImage,
  isCrossiVideoModel,
  generateCrossiVideo,
  ensurePuterSignedIn,
} from "@/lib/externalModels";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
  video?: string;
  files?: Array<{ name: string; type: string; data: string }>;
}

export const useChat = (conversationId: string | null, onTitleGenerated?: () => void) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newCredits, setNewCredits] = useState<number | null>(null);
  const [newImageCredits, setNewImageCredits] = useState<number | null>(null);
  const { toast } = useToast();

  // Load messages from database when conversation changes
  useEffect(() => {
    if (conversationId) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  const loadMessages = async () => {
    if (!conversationId) return;
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Parse messages, handling image/video data if stored as JSON
      const parsedMessages = (data || []).map(msg => {
        try {
          const parsed = JSON.parse(msg.content);
          return {
            role: msg.role,
            content: parsed.text || parsed.content || msg.content,
            image: parsed.image,
            video: parsed.video
          };
        } catch {
          return {
            role: msg.role,
            content: msg.content
          };
        }
      });
      
      setMessages(parsedMessages as Message[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async (
    content: string,
    modelCostId: string,
    files?: File[],
    options?: { videoSeconds?: number; selectedModelId?: string },
  ) => {
    if ((!content.trim() && !files?.length)) return;
    
    if (!conversationId) {
      toast({
        title: "No conversation",
        description: "Please create a conversation first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setNewCredits(null);
    setNewImageCredits(null);

    // Convert files to base64
    const fileData = files ? await Promise.all(
      files.map(async (file) => {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return {
          name: file.name,
          type: file.type,
          data: base64
        };
      })
    ) : [];

    const userMessage: Message = { 
      role: "user", 
      content,
      files: fileData
    };
    setMessages((prev) => [...prev, userMessage]);

    let assistantContent = "";
    let assistantImage: string | undefined = undefined;
    let assistantVideo: string | undefined = undefined;
    let assistantMessageCreated = false;

    const updateAssistantMessage = (chunk: string, imageData?: string, videoData?: string) => {
      assistantContent += chunk;
      if (imageData) assistantImage = imageData;
      if (videoData) assistantVideo = videoData;
      
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === "assistant") {
          return prev.map((msg, i) =>
            i === prev.length - 1 
              ? { ...msg, content: assistantContent, image: assistantImage, video: assistantVideo } 
              : msg
          );
        }
        assistantMessageCreated = true;
        return [...prev, { role: "assistant", content: assistantContent, image: assistantImage, video: assistantVideo }];
      });
    };

    const removeLastAssistantIfCreated = () => {
      if (!assistantMessageCreated) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" ? prev.slice(0, -1) : prev;
      });
      assistantMessageCreated = false;
    };

    try {
      // === Puter.js client-side image generation path ===
      // Look up the model to detect Puter image models without requiring extra args.
      const { data: modelRow } = selectedModelId
        ? { data: { model_id: selectedModelId } }
        : await supabase
            .from("model_costs")
            .select("model_id")
            .eq("id", modelCostId)
            .maybeSingle();

      // === Crossi 5.1 Video (client-side frame generation + assembly) ===
      if (modelRow?.model_id && isCrossiVideoModel(modelRow.model_id)) {
        const seconds = Math.max(1, Math.min(5, options?.videoSeconds ?? 3));

        const { data: { session: vSession } } = await supabase.auth.getSession();
        const vAuth = vSession?.access_token;
        if (!vAuth) {
          toast({ title: "Authentication Required", description: "Please log in.", variant: "destructive" });
          setMessages((prev) => prev.slice(0, -1));
          setIsLoading(false);
          return;
        }

        const deductRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduct-image-credits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${vAuth}` },
            body: JSON.stringify({ modelCostId, multiplier: seconds }),
          },
        );

        if (!deductRes.ok) {
          const err = await deductRes.json().catch(() => ({}));
          if (deductRes.status === 402) {
            toast({ title: "Insufficient Image Credits", description: err.error || `Need ${seconds * 5} image credits.`, variant: "destructive" });
          } else if (deductRes.status === 403) {
            toast({ title: "Access Denied", description: err.error || "This model requires a higher tier.", variant: "destructive" });
          } else {
            toast({ title: "Error", description: err.error || "Failed to start video.", variant: "destructive" });
          }
          setMessages((prev) => prev.slice(0, -1));
          setIsLoading(false);
          return;
        }
        const { credits: remainingV } = await deductRes.json();

        // Show progressive status immediately so mobile users see that work started.
        updateAssistantMessage(`🎬 Starting video generation…\n[[VIDEO_PROGRESS:0/${seconds * 10}]]`);

        try {
          const videoDataUrl = await generateCrossiVideo(
            content || "A short cinematic clip",
            modelRow.model_id,
            seconds,
            (cur, total) => {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1
                      ? { ...m, content: `${cur === 0 ? "🎬 Connecting to the image generator…" : "🎬 Generating frames…"}\n[[VIDEO_PROGRESS:${cur}/${total}]]` }
                      : m,
                  );
                }
                return prev;
              });
            },
          );

          assistantContent = "Here's your generated video:";
          assistantVideo = videoDataUrl;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, content: assistantContent, video: videoDataUrl }
                  : m,
              );
            }
            return [...prev, { role: "assistant", content: assistantContent, video: videoDataUrl }];
          });
          setNewImageCredits(remainingV);

          await saveMessagesToDatabase([
            userMessage,
            { role: "assistant", content: JSON.stringify({ text: assistantContent, video: videoDataUrl }) },
          ]);

          if (messages.length === 0) {
            generateConversationTitle([userMessage, { role: "assistant", content: assistantContent }]);
          }
        } catch (vErr) {
          console.error("Crossi video generation failed:", vErr);
          toast({
            title: "Video generation failed",
            description: vErr instanceof Error ? vErr.message : "Unknown error",
            variant: "destructive",
          });
          removeLastAssistantIfCreated();
        }

        setIsLoading(false);
        return;
      }
      // === End Crossi Video path ===

      if (modelRow?.model_id && isPuterImageModel(modelRow.model_id)) {
        // Server-side credit check + deduction (auth, tier access, atomic deduct)
        const { data: { session: puterSession } } = await supabase.auth.getSession();
        const puterAuth = puterSession?.access_token;
        if (!puterAuth) {
          toast({ title: "Authentication Required", description: "Please log in.", variant: "destructive" });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        const deductRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduct-image-credits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${puterAuth}` },
            body: JSON.stringify({ modelCostId }),
          }
        );

        if (!deductRes.ok) {
          const err = await deductRes.json().catch(() => ({}));
          if (deductRes.status === 402) {
            toast({ title: "Insufficient Image Credits", description: err.error || "Not enough credits.", variant: "destructive" });
          } else if (deductRes.status === 403) {
            toast({ title: "Access Denied", description: err.error || "This model requires a higher tier.", variant: "destructive" });
          } else {
            toast({ title: "Error", description: err.error || "Failed to start generation.", variant: "destructive" });
          }
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        const { credits: remainingImg } = await deductRes.json();

        try {
          const imageDataUrl = await generatePuterImage(content || "Generate an image", modelRow.model_id);
          const textResponse = "Here's your generated image:";
          updateAssistantMessage(textResponse, imageDataUrl);
          setNewImageCredits(remainingImg);

          await saveMessagesToDatabase([
            userMessage,
            { role: "assistant", content: JSON.stringify({ text: textResponse, image: imageDataUrl }) },
          ]);

          if (messages.length === 0) {
            generateConversationTitle([userMessage, { role: "assistant", content: textResponse }]);
          }
        } catch (puterErr) {
          console.error("Puter image generation failed:", puterErr);
          toast({
            title: "Image generation failed",
            description: puterErr instanceof Error ? puterErr.message : "Unknown error from Puter.js",
            variant: "destructive",
          });
          removeLastAssistantIfCreated();
        }

        setIsLoading(false);
        return;
      }
      // === End Puter.js path ===

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        toast({
          title: "Authentication Required",
          description: "Please log in to continue.",
          variant: "destructive",
        });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((msg) => ({
              role: msg.role,
              content: msg.content,
              files: msg.files,
            })),
            modelCostId,
          }),
        }
      );

      // Check content type to determine response handling
      const contentType = response.headers.get('content-type') || '';
      const isStreamResponse = contentType.includes('text/event-stream');

      // Handle non-streaming JSON responses (image/video generation)
      if (!isStreamResponse) {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 451) {
            toast({
              title: "Access Revoked",
              description: errorData.message || "Your access has been permanently revoked.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, -1));
            // Sign out and redirect
            await supabase.auth.signOut();
            window.location.href = '/auth';
            return;
          }

          if (response.status === 403 && errorData.error === 'jailbreak_detected') {
            toast({
              title: "⚠️ Policy Violation",
              description: errorData.message || "Your message was blocked for violating usage policy.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, -1));
            return;
          }

          if (response.status === 429) {
            toast({
              title: "Rate Limit",
              description: errorData.error || "Too many requests. Please try again later.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, -1));
            return;
          }
          
          if (response.status === 402) {
            toast({
              title: "Insufficient Credits",
              description: errorData.error || "You don't have enough credits.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, -1));
            window.location.reload();
            return;
          }

          throw new Error(errorData.error || "Request failed");
        }

        const data = await response.json();
        
        // Handle image generation response
        if (data.image) {
          const imageUrl = data.image;
          const textResponse = data.text || "Here's your generated image:";
          
          updateAssistantMessage(textResponse, imageUrl);
          if (data.credits !== undefined) {
            setNewImageCredits(data.credits);
          }
          
          await saveMessagesToDatabase([
            userMessage, 
            { 
              role: "assistant", 
              content: JSON.stringify({ text: textResponse, image: imageUrl })
            }
          ]);
          
          setIsLoading(false);
          return;
        }
        
        // Handle video generation response
        if (data.video) {
          const videoUrl = data.video;
          const textResponse = data.text || "Here's your generated video:";
          
          updateAssistantMessage(textResponse, undefined, videoUrl);
          setNewCredits(data.credits);
          
          await saveMessagesToDatabase([
            userMessage, 
            { 
              role: "assistant", 
              content: JSON.stringify({ text: textResponse, video: videoUrl })
            }
          ]);
          
          setIsLoading(false);
          return;
        }
      }

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 451) {
          toast({
            title: "Access Revoked",
            description: errorData.message || "Your access has been permanently revoked.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          await supabase.auth.signOut();
          window.location.href = '/auth';
          return;
        }

        if (response.status === 403 && errorData.error === 'jailbreak_detected') {
          toast({
            title: "⚠️ Policy Violation",
            description: errorData.message || "Your message was blocked for violating usage policy.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        if (response.status === 429) {
          toast({
            title: "Rate Limit",
            description: errorData.error || "Too many requests. Please try again later.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        
        if (response.status === 402) {
          toast({
            title: "Insufficient Credits",
            description: "You don't have enough credits. You'll get 15 credits tomorrow.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          window.location.reload();
          return;
        }
        
        if (response.status === 400) {
          toast({
            title: "Invalid Request",
            description: errorData.error || "Please check your input and try again.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        
        throw new Error("Failed to send message");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            
            // Check for credits update event
            if (parsed.type === 'credits') {
              setNewCredits(parsed.credits);
              continue;
            }
            
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              updateAssistantMessage(content);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            
            // Check for credits update event
            if (parsed.type === 'credits') {
              setNewCredits(parsed.credits);
              continue;
            }
            
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistantMessage(content);
          } catch {}
        }
      }

      // Save messages to database after successful response
      await saveMessagesToDatabase([userMessage, { role: "assistant", content: assistantContent }]);
      
      // Generate title after first exchange (2 messages total: 1 user + 1 assistant)
      if (messages.length === 0) {
        generateConversationTitle([userMessage, { role: "assistant", content: assistantContent }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1)); // Remove user message on error
    } finally {
      setIsLoading(false);
    }
  };

  const saveMessagesToDatabase = async (messagesToSave: Message[]) => {
    if (!conversationId) return;

    try {
      const messagesWithConversationId = messagesToSave.map(msg => ({
        conversation_id: conversationId,
        role: msg.role,
        content: msg.content,
      }));

      const { error } = await supabase
        .from('messages')
        .insert(messagesWithConversationId);

      if (error) throw error;

      // Update conversation's updated_at timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const generateConversationTitle = async (firstMessages: Message[]) => {
    if (!conversationId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-title`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: firstMessages,
            conversationId,
          }),
        }
      );

      if (response.ok) {
        onTitleGenerated?.();
      } else {
        console.error('Failed to generate title');
      }
    } catch (error) {
      console.error('Error generating title:', error);
    }
  };

  const clearMessages = async () => {
    if (!conversationId) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      if (error) throw error;
      setMessages([]);
    } catch (error) {
      console.error('Error clearing messages:', error);
      toast({
        title: "Error",
        description: "Failed to clear messages",
        variant: "destructive",
      });
    }
  };

  return { messages, isLoading, sendMessage, newCredits, newImageCredits, clearMessages };
};
