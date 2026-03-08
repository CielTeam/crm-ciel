import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { AdminTeam } from '@/hooks/useAdminData';

const DEPT_LABELS: Record<string, string> = {
  executive: 'Executive', hr: 'HR', operations: 'Operations',
  development: 'Development', technical: 'Technical', accounting: 'Accounting',
  marketing: 'Marketing', sales: 'Sales', logistics: 'Logistics',
};

interface TeamsTableProps {
  teams: AdminTeam[];
  onCreateTeam: () => void;
}

export function TeamsTable({ teams, onCreateTeam }: TeamsTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreateTeam} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Team
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{DEPT_LABELS[t.department] || t.department}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.leadName || '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t.memberCount}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(t.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No teams created yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
