// CSV export helpers shared across CRM pages

export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Always quote, escape internal quotes by doubling
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Build a short, filesystem-safe summary of active filters
export function buildFilterSummary(parts: Array<string | null | undefined | false>, max = 40): string {
  const tokens = parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map(p => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) return '';
  const joined = tokens.join('_').slice(0, max).replace(/-+$/, '');
  return joined;
}

export function buildExportFilename(base: string, summary?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const segments = [base];
  if (summary) segments.push(summary);
  segments.push(date);
  return `${segments.join('_')}.csv`;
}
