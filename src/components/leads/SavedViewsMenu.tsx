import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Bookmark, Star, Share2, Trash2, ChevronDown, Plus } from 'lucide-react';
import { useSavedViews, useSaveView, useDeleteSavedView, useSetDefaultView } from '@/hooks/useLeads';
import type { LeadFilters } from './LeadsFilterBar';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  currentFilters: LeadFilters;
  onApplyFilters: (filters: LeadFilters) => void;
}

export function SavedViewsMenu({ currentFilters, onApplyFilters }: Props) {
  const { user } = useAuth();
  const { data: views = [] } = useSavedViews();
  const saveView = useSaveView();
  const deleteView = useDeleteSavedView();
  const setDefault = useSetDefaultView();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    saveView.mutate(
      { name: name.trim(), filters: currentFilters, is_shared: shared },
      { onSuccess: () => { setSaveOpen(false); setName(''); setShared(false); } }
    );
  };

  const ownViews = views.filter(v => v.owner_id === user?.id);
  const sharedViews = views.filter(v => v.owner_id !== user?.id && v.is_shared);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Bookmark className="h-3.5 w-3.5 mr-1" />
            Views
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            <Button variant="ghost" size="sm" className="w-full justify-start h-8" onClick={() => setSaveOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Save current view
            </Button>
            {ownViews.length > 0 && (
              <>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground px-2 mt-2">My views</div>
                {ownViews.map(v => (
                  <div key={v.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => onApplyFilters((v.filters as unknown as LeadFilters) || {})}
                      className="flex-1 text-left px-2 py-1.5 rounded text-sm hover:bg-accent flex items-center gap-1.5 min-w-0"
                    >
                      {v.is_default && <Star className="h-3 w-3 text-[hsl(var(--warning))] fill-[hsl(var(--warning))] shrink-0" />}
                      {v.is_shared && <Share2 className="h-3 w-3 text-[hsl(var(--info))] shrink-0" />}
                      <span className="truncate">{v.name}</span>
                    </button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => setDefault.mutate({ id: v.id })}
                      title={v.is_default ? 'Default view' : 'Set as default'}
                    >
                      <Star className={`h-3 w-3 ${v.is_default ? 'text-[hsl(var(--warning))] fill-[hsl(var(--warning))]' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => deleteView.mutate(v.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </>
            )}
            {sharedViews.length > 0 && (
              <>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground px-2 mt-2">Shared</div>
                {sharedViews.map(v => (
                  <button
                    key={v.id}
                    onClick={() => onApplyFilters((v.filters as unknown as LeadFilters) || {})}
                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent flex items-center gap-1.5"
                  >
                    <Share2 className="h-3 w-3 text-[hsl(var(--info))] shrink-0" />
                    <span className="truncate">{v.name}</span>
                  </button>
                ))}
              </>
            )}
            {views.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No saved views yet.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Save the current filter combination for quick access later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot leads — EU" autoFocus />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal cursor-pointer flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Share with team
              </Label>
              <Switch checked={shared} onCheckedChange={setShared} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || saveView.isPending}>
              {saveView.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
