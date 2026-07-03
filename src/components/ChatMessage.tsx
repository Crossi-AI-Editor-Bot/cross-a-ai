import { useState } from "react";
import { Bot, User, Download, Maximize2, Copy as CopyIcon, FileText, ThumbsUp, ThumbsDown } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMods } from "@/hooks/useMods";
import { toast } from "@/hooks/use-toast";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  image?: string;
  video?: string;
  audio?: string;
  files?: Array<{ name: string; type: string; data: string }>;
  onDislike?: () => void;
}

const ChatMessage = ({ role, content, image, video, audio, files, onDislike }: ChatMessageProps) => {
  const isUser = role === "user";
  const { has } = useMods();
  const showCopy = has("copy");
  const showRating = has("like-dislike") && !isUser;
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  // Detect a "[[VIDEO_PROGRESS:cur/total]]" marker emitted during Crossi video
  // frame generation so we can render a real progress bar instead of raw text.
  const progressMatch = content.match(/\[\[VIDEO_PROGRESS:(\d+)\/(\d+)\]\]/);
  const cleanedContent = progressMatch
    ? content.replace(progressMatch[0], "").trim()
    : content;
  const progressCurrent = progressMatch ? Number(progressMatch[1]) : 0;
  const progressTotal = progressMatch ? Number(progressMatch[2]) : 0;
  const progressPct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;

  // Extract $CODE$ ... $/CODE$ blocks and split content into segments
  const codeRegex = /\$CODE\$([\s\S]*?)\$\/CODE\$/g;
  const segments: Array<{ type: "text" | "code"; value: string }> = [];
  {
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const src = cleanedContent;
    while ((match = codeRegex.exec(src)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: src.slice(lastIndex, match.index) });
      }
      segments.push({ type: "code", value: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < src.length) {
      segments.push({ type: "text", value: src.slice(lastIndex) });
    }
    if (segments.length === 0) segments.push({ type: "text", value: src });
  }

  const downloadCode = (code: string) => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `code-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = `ai-generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className={`flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center shadow-md">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
      )}
      
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gradient-primary text-primary-foreground shadow-md"
            : "bg-card text-card-foreground shadow-sm border border-border"
        }`}
      >
        {files && files.length > 0 && (
          <div className="mb-2 space-y-1">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs opacity-70">
                {file.type.startsWith('image/') ? (
                  <img src={file.data} alt={file.name} className="w-20 h-20 object-cover rounded" />
                ) : (
                  <span className="bg-secondary/50 px-2 py-1 rounded">{file.name}</span>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="text-sm leading-relaxed whitespace-pre-wrap space-y-2">
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <p key={i}>{seg.value}</p>
            ) : (
              <div key={i} className="rounded-md border border-border bg-muted/50 overflow-hidden">
                <pre className="p-3 text-xs overflow-x-auto whitespace-pre text-foreground">
                  <code>{seg.value}</code>
                </pre>
                <div className="flex items-center gap-2 px-2 py-1 border-t border-border bg-background/50">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(seg.value);
                      toast({ title: "Code copied to clipboard" });
                    }}
                  >
                    <CopyIcon className="w-3 h-3" /> Copy
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent text-foreground"
                    onClick={() => downloadCode(seg.value)}
                  >
                    <FileText className="w-3 h-3" /> Download .txt
                  </button>
                </div>
              </div>
            )
          )}
        </div>
        {showCopy && cleanedContent && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
            onClick={() => {
              navigator.clipboard.writeText(cleanedContent);
              toast({ title: "Copied to clipboard" });
            }}
          >
            <CopyIcon className="w-3 h-3" /> Copy
          </button>
        )}

        {showRating && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={rating !== null}
              className={`inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100 disabled:opacity-100 ${rating === "up" ? "text-primary" : ""}`}
              onClick={() => { setRating("up"); toast({ title: "Thanks for the feedback!" }); }}
            >
              <ThumbsUp className="w-3 h-3" /> Like
            </button>
            <button
              type="button"
              disabled={rating !== null}
              className={`inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100 disabled:opacity-100 ${rating === "down" ? "text-destructive" : ""}`}
              onClick={() => {
                setRating("down");
                toast({ title: "Regenerating with 50% discount…" });
                onDislike?.();
              }}
            >
              <ThumbsDown className="w-3 h-3" /> Dislike
            </button>
          </div>
        )}

        {progressMatch && (
          <div className="mt-3 space-y-1">
            <Progress value={progressPct} className="h-2" />
            <div className="flex justify-between text-xs opacity-70">
              <span>Frame {progressCurrent} / {progressTotal}</span>
              <span>{progressPct}%</span>
            </div>
          </div>
        )}
        
        {image && (
          <div className="mt-3 space-y-2">
            <div className="relative group rounded-lg overflow-hidden border border-border">
              <img 
                src={image} 
                alt="Generated image" 
                className="w-full h-auto"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="rounded-full"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl w-full">
                    <img 
                      src={image} 
                      alt="Generated image full view" 
                      className="w-full h-auto rounded-lg"
                    />
                  </DialogContent>
                </Dialog>
                
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full"
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {video && (
          <div className="mt-3 space-y-2">
            <div className="relative group rounded-lg overflow-hidden border border-border">
              <video 
                src={video} 
                controls
                className="w-full h-auto rounded-lg"
              >
                Your browser does not support the video tag.
              </video>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                    >
                      <Maximize2 className="w-4 h-4 mr-2" />
                      Full Screen
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl w-full">
                    <video 
                      src={video} 
                      controls
                      autoPlay
                      className="w-full h-auto rounded-lg"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </DialogContent>
                </Dialog>
                
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = video;
                    link.download = `ai-generated-video-${Date.now()}.mp4`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        )}

        {audio && (
          <div className="mt-3">
            <audio src={audio} controls className="w-full" />
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shadow-sm">
          <User className="w-5 h-5 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
