import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Building2, User, Briefcase } from 'lucide-react';
import { type Lead, useConvertLead } from '@/hooks/useLeads';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead | null;
}

export function ConvertLeadDialog({ open, onOpenChange, lead }: Props) {
  const convert = useConvertLead();
  const [accountName, setAccountName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [oppName, setOppName] = useState('');

  useEffect(() => {
    if (lead && open) {
      setAccountName(lead.company_name || '');
      const parts = (lead.contact_name || '').trim().split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setOppName(`${lead.company_name} - Opportunity`);
    }
  }, [lead, open]);

  if (!lead) return null;

  const handleConvert = () => {
    convert.mutate({
      id: lead.id,
      account_name: accountName,
      contact_first_name: firstName,
      contact_last_name: lastName,
      opportunity_name: oppName,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Convert Lead <ArrowRight className="h-4 w-4" /> Account
          </DialogTitle>
          <DialogDescription>
            This will create an Account, Contact, and Opportunity from this lead's data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Account */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Account</h4>
              <Badge variant="outline" className="text-[10px]">New</Badge>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Account Name</Label>
              <Input value={accountName} onChange={e => setAccountName(e.target.value)} />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Contact</h4>
              <Badge variant="outline" className="text-[10px]">New</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">First Name</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Last Name</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            {lead.contact_email && <p className="text-xs text-muted-foreground">Email: {lead.contact_email}</p>}
          </div>

          {/* Opportunity */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Opportunity</h4>
              <Badge variant="outline" className="text-[10px]">New</Badge>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Opportunity Name</Label>
              <Input value={oppName} onChange={e => setOppName(e.target.value)} />
            </div>
            {lead.estimated_value && (
              <p className="text-xs text-muted-foreground">Value: {lead.currency} {Number(lead.estimated_value).toLocaleString()}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConvert} disabled={convert.isPending || !accountName.trim()}>
            {convert.isPending ? 'Converting…' : 'Convert Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}