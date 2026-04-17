import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, ChevronDown } from 'lucide-react';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { CountryCombobox } from '@/components/shared/CountryCombobox';

export interface AccountFilters {
  search?: string;
  owner?: string;
  country_code?: string;
  industry?: string;
  status?: string;
  type?: string;
  health?: string;
}

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
];
const TYPE_OPTS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'partner', label: 'Partner' },
];
const HEALTH_OPTS = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'critical', label: 'Critical' },
];

function paramsToFilters(p: URLSearchParams): AccountFilters {
  const get = (k: string) => p.get(k) || undefined;
  return {
    search: get('q'),
    owner: get('owner'),
    country_code: get('country'),
    industry: get('industry'),
    status: get('status'),
    type: get('type'),
    health: get('health'),
  };
}

function filtersToParams(f: AccountFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.search) out.q = f.search;
  if (f.owner) out.owner = f.owner;
  if (f.country_code) out.country = f.country_code;
  if (f.industry) out.industry = f.industry;
  if (f.status) out.status = f.status;
  if (f.type) out.type = f.type;
  if (f.health) out.health = f.health;
  return out;
}

function activeCount(f: AccountFilters): number {
  return [f.owner, f.country_code, f.industry, f.status, f.type, f.health].filter(Boolean).length;
}

interface Props {
  filters: AccountFilters;
  onChange: (f: AccountFilters) => void;
}

export function AccountsFilterBar({ filters, onChange }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const { data: directory } = useDirectoryData();

  // Hydrate
  useEffect(() => {
    const fromUrl = paramsToFilters(searchParams);
    if (activeCount(fromUrl) > 0 || fromUrl.search) {
      onChange(fromUrl);
      if (fromUrl.search) setSearchInput(fromUrl.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync to URL
  useEffect(() => {
    const next = new URLSearchParams(filtersToParams(filters));
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((searchInput || '') !== (filters.search || '')) {
        onChange({ ...filters, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const owners = useMemo(() => directory || [], [directory]);
  const count = activeCount(filters);
  const update = (patch: Partial<AccountFilters>) => onChange({ ...filters, ...patch });
  const clearAll = () => { setSearchInput(''); onChange({}); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, industry..." value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-8 h-9" />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Owner {filters.owner ? <Badge variant="secondary" className="ml-2">1</Badge> : null}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <ScrollArea className="h-64">
            <div className="p-2 space-y-0.5">
              <button onClick={() => update({ owner: undefined })} className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!filters.owner ? 'bg-accent' : ''}`}>All owners</button>
              <Separator className="my-1" />
              {owners.map(u => (
                <button key={u.userId} onClick={() => update({ owner: u.userId })}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.owner === u.userId ? 'bg-accent' : ''}`}>
                  {u.displayName}
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Country {filters.country_code ? <Badge variant="secondary" className="ml-2">{filters.country_code}</Badge> : null}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <CountryCombobox value={filters.country_code} onChange={code => update({ country_code: code || undefined })} />
          {filters.country_code && (
            <Button variant="ghost" size="sm" className="w-full mt-2 h-8" onClick={() => update({ country_code: undefined })}>Clear</Button>
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Status {filters.status ? <Badge variant="secondary" className="ml-2">1</Badge> : null}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2" align="start">
          <button onClick={() => update({ status: undefined })} className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!filters.status ? 'bg-accent' : ''}`}>All</button>
          {STATUS_OPTS.map(o => (
            <button key={o.value} onClick={() => update({ status: o.value })}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.status === o.value ? 'bg-accent' : ''}`}>{o.label}</button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Type {filters.type ? <Badge variant="secondary" className="ml-2">1</Badge> : null}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2" align="start">
          <button onClick={() => update({ type: undefined })} className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!filters.type ? 'bg-accent' : ''}`}>All</button>
          {TYPE_OPTS.map(o => (
            <button key={o.value} onClick={() => update({ type: o.value })}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.type === o.value ? 'bg-accent' : ''}`}>{o.label}</button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Health {filters.health ? <Badge variant="secondary" className="ml-2">1</Badge> : null}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2" align="start">
          <button onClick={() => update({ health: undefined })} className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!filters.health ? 'bg-accent' : ''}`}>All</button>
          {HEALTH_OPTS.map(o => (
            <button key={o.value} onClick={() => update({ health: o.value })}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.health === o.value ? 'bg-accent' : ''}`}>{o.label}</button>
          ))}
        </PopoverContent>
      </Popover>

      <div className="w-32">
        <Input placeholder="Industry" value={filters.industry || ''} onChange={e => update({ industry: e.target.value || undefined })} className="h-9" />
      </div>

      {(count > 0 || filters.search) && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
