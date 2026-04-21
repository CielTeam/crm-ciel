import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjects, useAttachTaskToProject } from '@/hooks/useProjects';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  currentProjectId?: string | null;
}

export function AttachToProjectDialog({ open, onOpenChange, taskId, currentProjectId }: Props) {
  const { data: projects } = useProjects('mine');
  const attach = useAttachTaskToProject();
  const [selected, setSelected] = useState<string>(currentProjectId || '');
  const [newName, setNewName] = useState('');

  const handleAttachExisting = async () => {
    if (!selected) return;
    try {
      await attach.mutateAsync({ task_id: taskId, project_id: selected });
      toast.success('Added to project');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleCreatePersonal = async () => {
    if (!newName.trim()) return;
    try {
      await attach.mutateAsync({ task_id: taskId, project_id: null, create_personal_project_name: newName.trim() });
      toast.success('Personal project created and task added');
      setNewName('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRemove = async () => {
    try {
      await attach.mutateAsync({ task_id: taskId, project_id: null });
      toast.success('Removed from project');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{currentProjectId ? 'Move to project' : 'Add to project'}</DialogTitle>
          <DialogDescription>Group this task under a project for organization and analytics.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="existing">Existing project</TabsTrigger>
            <TabsTrigger value="new">New personal</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Pick a project</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {(projects || []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
                        {p.name}
                        {p.is_personal && <span className="text-xs text-muted-foreground">(personal)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              {currentProjectId && (
                <Button variant="ghost" onClick={handleRemove} disabled={attach.isPending}>Remove from project</Button>
              )}
              <Button onClick={handleAttachExisting} disabled={!selected || attach.isPending}>
                {attach.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>New personal project name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. My follow-ups" />
            </div>
            <DialogFooter>
              <Button onClick={handleCreatePersonal} disabled={!newName.trim() || attach.isPending}>
                {attach.isPending ? 'Creating...' : 'Create & add'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
