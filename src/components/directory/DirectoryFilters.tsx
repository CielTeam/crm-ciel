import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { DEPARTMENTS } from '@/types/roles';

interface DirectoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  department: string;
  onDepartmentChange: (value: string) => void;
}

const DEPT_LABELS: Record<string, string> = {
  executive: 'Executive',
  hr: 'HR',
  operations: 'Operations',
  development: 'Development',
  technical: 'Technical',
  accounting: 'Accounting',
  marketing: 'Marketing',
  sales: 'Sales',
  logistics: 'Logistics',
};

export function DirectoryFilters({ search, onSearchChange, department, onDepartmentChange }: DirectoryFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={department} onValueChange={onDepartmentChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="All Departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
          {DEPARTMENTS.map((d) => (
            <SelectItem key={d} value={d}>
              {DEPT_LABELS[d] || d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
