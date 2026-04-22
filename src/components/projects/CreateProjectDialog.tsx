import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
const EXEC_ROLES = ['chairman', 'vice_president', 'head_of_sales'];
type Visibility = 'single' | 'multiple' | 'all';

export function CreateProjectDialog({ open, onOpenChange, defaultDepartment, onCreated }: Props) {
  const { primaryRole } = useAuth();
  const role = primaryRole;
  const createProject = useCreateProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);
  const [department, setDepartment] = useState<string>(defaultDepartment || '');
  const [color, setColor] = useState(COLORS[0]);
  const [targetDate, setTargetDate] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('single');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const isExec = !!role && EXEC_ROLES.includes(role);

  const reset = () => {
    setName(''); setDescription(''); setIsPersonal(false);
    setDepartment(defaultDepartment || ''); setColor(COLORS[0]); setTargetDate('');
    setVisibility('single'); setSelectedDepts([]);
  };

  const toggleDept = (d: string) => {
    setSelectedDepts((prev) => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const visibilityPreview = useMemo(() => {
    if (isPersonal) return null;
    if (!isExec || visibility === 'single') return department || null;
    if (visibility === 'all') return DEPARTMENTS.join(', ');
    return selectedDepts.join(', ') || null;
  }, [isPersonal, isExec, visibility, department, selectedDepts]);

  const isValid = () => {
    if (!name.trim()) return false;
    if (isPersonal) return true;
    if (!isExec || visibility === 'single') return !!department;
    if (visibility === 'multiple') return selectedDepts.length > 0;
    return true; // all
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;

    let primaryDept: string | null = null;
    let sharedDepts: string[] | undefined;

    if (!isPersonal) {
      if (!isExec || visibility === 'single') {
        primaryDept = department || null;
      } else if (visibility === 'multiple') {
        primaryDept = selectedDepts[0];
        sharedDepts = selectedDepts.slice(1);
      } else {
        // all
        primaryDept = DEPARTMENTS[0];
        sharedDepts = DEPARTMENTS.slice(1);
      }
    }

    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        is_personal: isPersonal,
        department: primaryDept,
        color,
        target_end_date: targetDate || null,
        ...(sharedDepts && sharedDepts.length > 0 ? { shared_departments: sharedDepts } : {}),
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
            <>
              {isExec && (
                <div className="space-y-1.5">
                  <Label>Visibility</Label>
                  <div className="grid grid-cols-3 gap-1 rounded-md border p-1">
                    {(['single', 'multiple', 'all'] as Visibility[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVisibility(v)}
                        className={`text-xs py-1.5 rounded-sm capitalize transition-colors ${
                          visibility === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                        }`}
                      >
                        {v === 'single' ? 'Single dept' : v === 'multiple' ? 'Multiple' : 'All depts'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!isExec || visibility === 'single') && (
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

              {isExec && visibility === 'multiple' && (
                <div className="space-y-1.5">
                  <Label>Departments <span className="text-destructive">*</span></Label>
                  <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                    {DEPARTMENTS.map((d) => (
                      <label key={d} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/40">
                        <Checkbox
                          checked={selectedDepts.includes(d)}
                          onCheckedChange={() => toggleDept(d)}
                        />
                        <span className="text-sm capitalize flex-1">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {visibilityPreview && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Visible to: <span className="capitalize">{visibilityPreview}</span>
                </p>
              )}
            </>
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
            <Button type="submit" disabled={!isValid() || createProject.isPending}>
              {createProject.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
