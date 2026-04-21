import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateProject } from '@/hooks/useProjects';
import { useAuth } from '@/contexts/AuthContext';
import { DEPARTMENTS } from '@/types/roles';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDepartment?: string | null;
  onCreated?: (projectId: string) => void;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export function CreateProjectDialog({ open, onOpenChange, defaultDepartment, onCreated }: Props) {
  const { role } = useAuth();
  const createProject = useCreateProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);
  const [department, setDepartment] = useState<string>(defaultDepartment || '');
  const [color, setColor] = useState(COLORS[0]);
  const [targetDate, setTargetDate] = useState('');

  const isExec = role === 'chairman' || role === 'vice_president';

  const reset = () => {
    setName(''); setDescription(''); setIsPersonal(false);
    setDepartment(defaultDepartment || ''); setColor(COLORS[0]); setTargetDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        is_personal: isPersonal,
        department: isPersonal ? null : (department || null),
        color,
        target_end_date: targetDate || null,
      });
      toast.success('Project created');
      onCreated?.(project.id);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Group related tasks under a project.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q2 Launch" required />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Personal project</p>
              <p className="text-xs text-muted-foreground">Only visible to you.</p>
            </div>
            <Switch checked={isPersonal} onCheckedChange={setIsPersonal} />
          </div>

          {!isPersonal && (
            <div className="space-y-1.5">
              <Label>Department <span className="text-destructive">*</span></Label>
              <Select value={department} onValueChange={setDepartment} disabled={!isExec && !!defaultDepartment}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Target date</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || createProject.isPending || (!isPersonal && !department)}>
              {createProject.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
