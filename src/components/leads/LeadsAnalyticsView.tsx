import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, Legend, Sector } from 'recharts';
import { type Lead, LEAD_STAGES, computeLeadScore } from '@/hooks/useLeads';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const STAGE_COLORS: Record<string, string> = {
  new: 'hsl(210, 80%, 55%)',
  contacted: 'hsl(220, 83%, 53%)',
  qualified: 'hsl(40, 90%, 50%)',
  proposal: 'hsl(260, 60%, 55%)',
  negotiation: 'hsl(30, 85%, 55%)',
  won: 'hsl(142, 71%, 45%)',
  lost: 'hsl(0, 72%, 51%)',
};

const SCORE_COLORS: Record<string, string> = {
  hot: 'hsl(0, 72%, 51%)',
  warm: 'hsl(40, 90%, 50%)',
  cold: 'hsl(210, 80%, 55%)',
};

interface Props {
  leads: Lead[] | undefined;
}

export function LeadsAnalyticsView({ leads }: Props) {
  const allLeads = leads || [];

  // Pipeline by stage
  const pipelineData = useMemo(() => {
    return LEAD_STAGES.map(s => ({
      stage: s.label,
      count: allLeads.filter(l => l.stage === s.value).length,
      value: allLeads.filter(l => l.stage === s.value).reduce((sum, l) => sum + Number(l.estimated_value || 0), 0),
      fill: STAGE_COLORS[s.value],
    }));
  }, [allLeads]);

  const pipelineConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    LEAD_STAGES.forEach(s => { cfg[s.label] = { label: s.label, color: STAGE_COLORS[s.value] }; });
    return cfg;
  }, []);

  // Score distribution
  const scoreData = useMemo(() => {
    const counts = { hot: 0, warm: 0, cold: 0 };
    allLeads.forEach(l => {
      if (l.stage !== 'won' && l.stage !== 'lost') {
        counts[computeLeadScore(l).band]++;
      }
    });
    return Object.entries(counts).map(([band, count]) => ({ band: band.charAt(0).toUpperCase() + band.slice(1), count, fill: SCORE_COLORS[band] }));
  }, [allLeads]);

  // Monthly trend (last 6 months)
  const trendData = useMemo(() => {
    const months: { month: string; created: number; won: number; lost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const monthLabel = format(d, 'MMM yyyy');
      months.push({
        month: monthLabel,
        created: allLeads.filter(l => isWithinInterval(new Date(l.created_at), { start, end })).length,
        won: allLeads.filter(l => l.stage === 'won' && isWithinInterval(new Date(l.updated_at), { start, end })).length,
        lost: allLeads.filter(l => l.stage === 'lost' && isWithinInterval(new Date(l.updated_at), { start, end })).length,
      });
    }
    return months;
  }, [allLeads]);

  const trendConfig: ChartConfig = {
    created: { label: 'Created', color: 'hsl(220, 83%, 53%)' },
    won: { label: 'Won', color: 'hsl(142, 71%, 45%)' },
    lost: { label: 'Lost', color: 'hsl(0, 72%, 51%)' },
  };

  // Value by source
  const sourceData = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    allLeads.forEach(l => {
      const src = l.source || 'Unknown';
      if (!map[src]) map[src] = { count: 0, value: 0 };
      map[src].count++;
      map[src].value += Number(l.estimated_value || 0);
    });
    return Object.entries(map)
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [allLeads]);

  // Summary metrics
  const metrics = useMemo(() => {
    const active = allLeads.filter(l => !['won', 'lost'].includes(l.stage));
    const won = allLeads.filter(l => l.stage === 'won');
    const lost = allLeads.filter(l => l.stage === 'lost');
    const convRate = (won.length + lost.length) > 0 ? (won.length / (won.length + lost.length) * 100) : 0;
    const avgValue = active.length > 0 ? active.reduce((s, l) => s + Number(l.estimated_value || 0), 0) / active.length : 0;
    const totalPipeline = active.reduce((s, l) => s + Number(l.weighted_forecast || 0), 0);
    return { convRate: convRate.toFixed(1), avgValue: Math.round(avgValue), totalPipeline: Math.round(totalPipeline), activeCount: active.length };
  }, [allLeads]);

  const sourceConfig: ChartConfig = { value: { label: 'Pipeline Value', color: 'hsl(220, 83%, 53%)' } };

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">{metrics.convRate}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">${metrics.avgValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Avg Deal Value</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">${metrics.totalPipeline.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Weighted Pipeline</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">{metrics.activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Deals</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline funnel */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pipelineConfig} className="h-[280px]">
              <BarChart data={pipelineData} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="stage" type="category" width={85} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {pipelineData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Score distribution */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead Score Distribution</CardTitle>
            <p className="text-[10px] text-muted-foreground italic">Provisional UI-only scoring</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ hot: { label: 'Hot', color: SCORE_COLORS.hot }, warm: { label: 'Warm', color: SCORE_COLORS.warm }, cold: { label: 'Cold', color: SCORE_COLORS.cold } }} className="h-[280px]">
              <PieChart>
                <Pie data={scoreData} dataKey="count" nameKey="band" cx="50%" cy="50%" outerRadius={100} label={({ band, count }) => `${band}: ${count}`}>
                  {scoreData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Trend (6 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[280px]">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="created" stroke="hsl(220, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="won" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="lost" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Source breakdown */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={sourceConfig} className="h-[280px]">
              <BarChart data={sourceData}>
                <XAxis dataKey="source" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(220, 83%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
