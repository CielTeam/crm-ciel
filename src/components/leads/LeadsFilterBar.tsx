import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Filter, X, Search, ChevronDown } from 'lucide-react';
import { LEAD_STAGES, type LeadStage } from '@/hooks/useLeads';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { CountryCombobox } from '@/components/shared/CountryCombobox';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface LeadFilters {
  search?: string;
  stages?: LeadStage[];
  assigned_to?: string;
  country_code?: string;
  city?: string;
  source?: string;
  industry?: string;
  score_bands?: ('hot' | 'warm' | 'cold')[];
  value_min?: number;
  value_max?: number;
  probability_min?: number;
  probability_max?: number;
  created_from?: string;
  created_to?: string;
  close_from?: string;
  close_to?: string;
  last_contact_from?: string;
  last_contact_to?: string;
  overdue_followups?: boolean;
  no_activity_14d?: boolean;
  expiring_services?: boolean;
  converted?: boolean;
}

const SCORE_BANDS: { value: 'hot' | 'warm' | 'cold'; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
];

// Encode/decode filters <-> URLSearchParams
function filtersToParams(f: LeadFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.search) out.q = f.search;
  if (f.stages?.length) out.stages = f.stages.join(',');
  if (f.assigned_to) out.owner = f.assigned_to;
  if (f.country_code) out.country = f.country_code;
  if (f.city) out.city = f.city;
  if (f.source) out.source = f.source;
  if (f.industry) out.industry = f.industry;
  if (f.score_bands?.length) out.score = f.score_bands.join(',');
  if (f.value_min != null) out.vmin = String(f.value_min);
  if (f.value_max != null) out.vmax = String(f.value_max);
  if (f.probability_min != null) out.pmin = String(f.probability_min);
  if (f.probability_max != null) out.pmax = String(f.probability_max);
  if (f.created_from) out.cfrom = f.created_from;
  if (f.created_to) out.cto = f.created_to;
  if (f.close_from) out.clfrom = f.close_from;
  if (f.close_to) out.clto = f.close_to;
  if (f.last_contact_from) out.lcfrom = f.last_contact_from;
  if (f.last_contact_to) out.lcto = f.last_contact_to;
  if (f.overdue_followups) out.overdue = '1';
  if (f.no_activity_14d) out.noact = '1';
  if (f.expiring_services) out.expsvc = '1';
  if (f.converted === true) out.conv = '1';
  if (f.converted === false) out.conv = '0';
  return out;
}

function paramsToFilters(p: URLSearchParams): LeadFilters {
  const get = (k: string) => p.get(k) || undefined;
  const num = (k: string) => {
    const v = p.get(k);
    return v != null && v !== '' ? Number(v) : undefined;
  };
  const stages = p.get('stages')?.split(',').filter(Boolean) as LeadStage[] | undefined;
  const score_bands = p.get('score')?.split(',').filter(Boolean) as ('hot' | 'warm' | 'cold')[] | undefined;
  const conv = p.get('conv');
  return {
    search: get('q'),
    stages,
    assigned_to: get('owner'),
    country_code: get('country'),
    city: get('city'),
    source: get('source'),
    industry: get('industry'),
    score_bands,
    value_min: num('vmin'),
    value_max: num('vmax'),
    probability_min: num('pmin'),
    probability_max: num('pmax'),
    created_from: get('cfrom'),
    created_to: get('cto'),
    close_from: get('clfrom'),
    close_to: get('clto'),
    last_contact_from: get('lcfrom'),
    last_contact_to: get('lcto'),
    overdue_followups: p.get('overdue') === '1',
    no_activity_14d: p.get('noact') === '1',
    expiring_services: p.get('expsvc') === '1',
    converted: conv === '1' ? true : conv === '0' ? false : undefined,
  };
}

function countActiveFilters(f: LeadFilters): number {
  let n = 0;
  if (f.stages?.length) n++;
  if (f.assigned_to) n++;
  if (f.country_code) n++;
  if (f.city) n++;
  if (f.source) n++;
  if (f.industry) n++;
  if (f.score_bands?.length) n++;
  if (f.value_min != null || f.value_max != null) n++;
  if (f.probability_min != null || f.probability_max != null) n++;
  if (f.created_from || f.created_to) n++;
  if (f.close_from || f.close_to) n++;
  if (f.last_contact_from || f.last_contact_to) n++;
  if (f.overdue_followups) n++;
  if (f.no_activity_14d) n++;
  if (f.expiring_services) n++;
  if (f.converted !== undefined) n++;
  return n;
}

interface Props {
  filters: LeadFilters;
  onChange: (filters: LeadFilters) => void;
}

export function LeadsFilterBar({ filters, onChange }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const { data: directory } = useDirectoryData();

  // Hydrate from URL on first mount
  useEffect(() => {
    const fromUrl = paramsToFilters(searchParams);
    if (countActiveFilters(fromUrl) > 0 || fromUrl.search) {
      onChange(fromUrl);
      if (fromUrl.search) setSearchInput(fromUrl.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync filters -> URL
  useEffect(() => {
    const params = filtersToParams(filters);
    const next = new URLSearchParams(params);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Debounce search input -> filters.search
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
  const activeCount = countActiveFilters(filters);

  const update = (patch: Partial<LeadFilters>) => onChange({ ...filters, ...patch });
  const toggleStage = (s: LeadStage) => {
    const cur = new Set(filters.stages || []);
    cur.has(s) ? cur.delete(s) : cur.add(s);
    update({ stages: cur.size ? Array.from(cur) : undefined });
  };
  const toggleBand = (b: 'hot' | 'warm' | 'cold') => {
    const cur = new Set(filters.score_bands || []);
    cur.has(b) ? cur.delete(b) : cur.add(b);
    update({ score_bands: cur.size ? Array.from(cur) : undefined });
  };
  const clearAll = () => {
    setSearchInput('');
    onChange({});
  };

  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* Stages multi */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Stage
              {filters.stages?.length ? <Badge variant="secondary" className="ml-2">{filters.stages.length}</Badge> : null}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1">
              {LEAD_STAGES.map(s => (
                <label key={s.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                  <Checkbox checked={filters.stages?.includes(s.value) || false} onCheckedChange={() => toggleStage(s.value)} />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Owner */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Owner
              {filters.assigned_to ? <Badge variant="secondary" className="ml-2">1</Badge> : null}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <ScrollArea className="h-64">
              <div className="p-2 space-y-0.5">
                <button
                  onClick={() => update({ assigned_to: undefined })}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!filters.assigned_to ? 'bg-accent' : ''}`}
                >
                  All owners
                </button>
                <button
                  onClick={() => update({ assigned_to: '__unassigned__' })}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.assigned_to === '__unassigned__' ? 'bg-accent' : ''}`}
                >
                  Unassigned
                </button>
                <Separator className="my-1" />
                {owners.map(u => (
                  <button
                    key={u.userId}
                    onClick={() => update({ assigned_to: u.userId })}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${filters.assigned_to === u.userId ? 'bg-accent' : ''}`}
                  >
                    {u.displayName}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Country */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Country
              {filters.country_code ? <Badge variant="secondary" className="ml-2">{filters.country_code}</Badge> : null}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <CountryCombobox
              value={filters.country_code}
              onChange={(code) => update({ country_code: code || undefined })}
            />
            {filters.country_code && (
              <Button variant="ghost" size="sm" className="w-full mt-2 h-8" onClick={() => update({ country_code: undefined })}>
                Clear country
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {/* Score band */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Score
              {filters.score_bands?.length ? <Badge variant="secondary" className="ml-2">{filters.score_bands.length}</Badge> : null}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            {SCORE_BANDS.map(b => (
              <label key={b.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                <Checkbox checked={filters.score_bands?.includes(b.value) || false} onCheckedChange={() => toggleBand(b.value)} />
                <span className="text-sm">{b.label}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* More filters: ranges, dates */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Filter className="h-3.5 w-3.5 mr-1" />
              More
              {(['value_min','value_max','probability_min','probability_max','created_from','created_to','close_from','close_to','last_contact_from','last_contact_to','city','source','industry'] as (keyof LeadFilters)[])
                .some(k => filters[k] != null && filters[k] !== '') ? (
                  <Badge variant="secondary" className="ml-2">!</Badge>
                ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-3" align="start">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={filters.city || ''} onChange={(e) => update({ city: e.target.value || undefined })} className="h-8 mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Source</Label>
                  <Input value={filters.source || ''} onChange={(e) => update({ source: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Industry</Label>
                  <Input value={filters.industry || ''} onChange={(e) => update({ industry: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Value min</Label>
                  <Input type="number" value={filters.value_min ?? ''} onChange={(e) => update({ value_min: e.target.value ? Number(e.target.value) : undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Value max</Label>
                  <Input type="number" value={filters.value_max ?? ''} onChange={(e) => update({ value_max: e.target.value ? Number(e.target.value) : undefined })} className="h-8 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Probability min %</Label>
                  <Input type="number" min={0} max={100} value={filters.probability_min ?? ''} onChange={(e) => update({ probability_min: e.target.value ? Number(e.target.value) : undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Probability max %</Label>
                  <Input type="number" min={0} max={100} value={filters.probability_max ?? ''} onChange={(e) => update({ probability_max: e.target.value ? Number(e.target.value) : undefined })} className="h-8 mt-1" />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Created from</Label>
                  <Input type="date" value={filters.created_from?.slice(0, 10) || ''} onChange={(e) => update({ created_from: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Created to</Label>
                  <Input type="date" value={filters.created_to?.slice(0, 10) || ''} onChange={(e) => update({ created_to: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Close from</Label>
                  <Input type="date" value={filters.close_from || ''} onChange={(e) => update({ close_from: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Close to</Label>
                  <Input type="date" value={filters.close_to || ''} onChange={(e) => update({ close_to: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Last contact from</Label>
                  <Input type="date" value={filters.last_contact_from?.slice(0, 10) || ''} onChange={(e) => update({ last_contact_from: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Last contact to</Label>
                  <Input type="date" value={filters.last_contact_to?.slice(0, 10) || ''} onChange={(e) => update({ last_contact_to: e.target.value || undefined })} className="h-8 mt-1" />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Quick toggles */}
        <Separator orientation="vertical" className="h-6 mx-1" />
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!filters.overdue_followups} onCheckedChange={(v) => update({ overdue_followups: v || undefined })} />
            <span>Overdue</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!filters.no_activity_14d} onCheckedChange={(v) => update({ no_activity_14d: v || undefined })} />
            <span>No activity 14d</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!filters.expiring_services} onCheckedChange={(v) => update({ expiring_services: v || undefined })} />
            <span>Expiring</span>
          </label>
        </div>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 ml-auto">
            <X className="h-3.5 w-3.5 mr-1" />
            Clear ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}
