import { useState } from 'react';
import { Check, ChevronsUpDown, Globe, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getOrderedCountries, getCountryByCode } from '@/lib/countries';

interface Props {
  value: string | null;
  onChange: (code: string | null, name: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function CountryCombobox({ value, onChange, placeholder = 'Select country…', className, disabled, required }: Props) {
  const [open, setOpen] = useState(false);
  const { pinned, rest } = getOrderedCountries();
  const selected = getCountryByCode(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-9', !selected && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Globe className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">{selected ? selected.name : placeholder}</span>
            {required && !selected && <span className="text-destructive">*</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            {pinned.length > 0 && (
              <>
                <CommandGroup heading="Frequently used">
                  {pinned.map((c) => (
                    <CommandItem
                      key={c.code}
                      value={`${c.name} ${c.code}`}
                      onSelect={() => { onChange(c.code, c.name); setOpen(false); }}
                    >
                      <Star className="mr-2 h-3 w-3 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{c.code}</span>
                      <Check className={cn('h-3.5 w-3.5', value === c.code ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="All countries">
              {rest.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => { onChange(c.code, c.name); setOpen(false); }}
                >
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-muted-foreground mr-2">{c.code}</span>
                  <Check className={cn('h-3.5 w-3.5', value === c.code ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
