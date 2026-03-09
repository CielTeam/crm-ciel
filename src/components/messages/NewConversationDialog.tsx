import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCreateConversation } from '@/hooks/useMessages';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const { user } = useAuth();
  const { data: users } = useDirectoryData();
  const createConversation = useCreateConversation();

  const filtered = useMemo(() => {
    return (users || [])
      .filter(u => u.userId !== user?.id)
      .filter(u => u.displayName.toLowerCase().includes(search.toLowerCase()) ||
                   u.email.toLowerCase().includes(search.toLowerCase()));
  }, [users, user?.id, search]);

  const toggle = (userId: string) => {
    setSelected(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    try {
      const conv = await createConversation.mutateAsync({
        type: selected.length > 1 ? 'group' : 'direct',
        member_ids: selected,
      });
      onCreated(conv.id);
      setOpen(false);
      setSelected([]);
      setSearch('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create conversation');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          New Chat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search people..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <ScrollArea className="h-64">
          <div className="space-y-1">
            {filtered.map(u => (
              <button
                key={u.userId}
                onClick={() => toggle(u.userId)}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                  selected.includes(u.userId) ? 'bg-accent' : 'hover:bg-muted'
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {u.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.roleLabel}</p>
                </div>
                {selected.includes(u.userId) && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={selected.length === 0 || createConversation.isPending}>
            {createConversation.isPending ? 'Creating...' : `Start Chat${selected.length > 1 ? ` (${selected.length})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
