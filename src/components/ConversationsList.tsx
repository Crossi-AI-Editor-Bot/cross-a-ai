import { MessageSquarePlus, Trash2, Edit2, Phone, Puzzle, Settings as SettingsIcon } from "lucide-react";
import QueueDialog from "./QueueDialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Menu } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationsListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onContinueCall?: (conversationId: string) => void;
}

const ConversationsList = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onRenameConversation,
  onContinueCall,
}: ConversationsListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const saveRename = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Conversations">
          <Menu className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-2">
          <Button
            onClick={() => {
              onCreateConversation();
              setOpen(false);
            }}
            className="w-full justify-start"
            variant="outline"
          >
            <MessageSquarePlus className="w-4 h-4 mr-2" />
            New Conversation
          </Button>
          <div className="flex gap-2">
            <Button
              onClick={() => { setOpen(false); navigate("/mods"); }}
              className="flex-1 justify-start"
              variant="outline"
            >
              <Puzzle className="w-4 h-4 mr-2" />
              Mods
            </Button>
            <Button
              onClick={() => { setOpen(false); navigate("/settings"); }}
              className="flex-1 justify-start"
              variant="outline"
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
          <div className="flex">
            <QueueDialog />
            <span className="ml-2 text-sm text-muted-foreground self-center">Generation queue</span>
          </div>

          <ScrollArea className="h-[calc(100vh-180px)] mt-4">
            <div className="space-y-1 pr-4">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                    conversation.title.startsWith('📞')
                      ? 'bg-primary/10 border border-primary/20 hover:bg-primary/20'
                      : 'hover:bg-accent'
                  } ${
                    currentConversationId === conversation.id
                      ? conversation.title.startsWith('📞') ? 'bg-primary/20 ring-1 ring-primary/40' : 'bg-accent'
                      : ''
                  }`}
                >
                  {editingId === conversation.id ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditTitle("");
                        }
                      }}
                      autoFocus
                      className="h-8"
                    />
                  ) : (
                    <>
                      <div
                        onClick={() => {
                          onSelectConversation(conversation.id);
                          setOpen(false);
                        }}
                        className="flex-1 truncate text-sm"
                      >
                        {conversation.title}
                      </div>
                      {conversation.title.startsWith('📞') && onContinueCall && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          title="Continue call"
                          onClick={(e) => {
                            e.stopPropagation();
                            onContinueCall(conversation.id);
                            setOpen(false);
                          }}
                        >
                          <Phone className="w-3 h-3" />
                        </Button>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(conversation.id, conversation.title);
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this conversation and all its messages.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDeleteConversation(conversation.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ConversationsList;
