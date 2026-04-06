import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X } from "lucide-react";
import { useDevMode } from "@/hooks/useDevMode";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyClickCount = useRef(0);
  const emptyClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { devMode, toggleDevMode } = useDevMode();

  const handleSendClick = useCallback(() => {
    if (!input.trim() && files.length === 0) {
      emptyClickCount.current += 1;
      if (emptyClickTimer.current) clearTimeout(emptyClickTimer.current);
      emptyClickTimer.current = setTimeout(() => { emptyClickCount.current = 0; }, 3000);

      if (emptyClickCount.current >= 7) {
        emptyClickCount.current = 0;
        const newState = !devMode;
        toggleDevMode(newState);
        toast(newState ? "🛠️ Dev Mode activated" : "Dev Mode deactivated");
      }
    }
  }, [input, files, devMode, toggleDevMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || files.length > 0) && !disabled) {
      onSend(input.trim(), files);
      setInput("");
      setFiles([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-2 bg-secondary px-3 py-1 rounded-full text-sm">
              <span className="truncate max-w-[200px]">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="hover:bg-secondary-foreground/10 rounded-full p-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="h-[60px] w-[60px]"
        >
          <Paperclip className="w-5 h-5" />
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={disabled}
          className="resize-none min-h-[60px] max-h-[200px] shadow-sm"
          rows={1}
        />
        <Button
          type="button"
          onClick={(e) => {
            handleSendClick();
            if (input.trim() || files.length > 0) {
              handleSubmit(e);
            }
          }}
          disabled={disabled}
          className="h-[60px] px-6 bg-gradient-primary hover:opacity-90 transition-opacity shadow-md"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </form>
  );
};

export default ChatInput;
