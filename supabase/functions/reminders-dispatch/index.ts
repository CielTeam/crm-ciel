import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReminderRow {
  id: string;
  event_id: string;
  user_id: string;
  channel: string;
  offset_minutes: number;
  fire_at: string;
}

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  owner_user_id: string;
  created_by: string;
  visibility: string;
  deleted_at: string | null;
}

async function broadcastNotification(admin: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  try {
    const channel = admin.channel(`user-notify-${userId}`);
    await channel.send({ type: 'broadcast', event: 'new_notification', payload });
    await admin.removeChannel(channel);
  } catch { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const now = new Date();
    const cutoffEarly = new Date(now.getTime() - 60 * 60_000).toISOString(); // drop stale > 60 min
    const cutoffLate = new Date(now.getTime() + 30_000).toISOString(); // include reminders due within 30s

    // Claim batch atomically
    const { data: claimed, error: claimErr } = await admin
      .from('event_reminders')
      .select('id, event_id, user_id, channel, offset_minutes, fire_at')
      .eq('status', 'pending')
      .lte('fire_at', cutoffLate)
      .gt('fire_at', cutoffEarly)
      .limit(500);
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark claimed batch as in-flight (set sent_at to claim time, but keep status pending until success)
    // We use a simple approach: update each by id; if the update affects 0 rows it was already claimed
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    // Fetch events in one go
    const eventIds = [...new Set((claimed as ReminderRow[]).map(r => r.event_id))];
    const { data: events } = await admin.from('calendar_events').select('id, title, start_time, end_time, location, owner_user_id, created_by, visibility, deleted_at').in('id', eventIds);
    const eventMap = new Map<string, EventRow>((events || []).map((e: EventRow) => [e.id, e]));

    // Drop stale (older than 15 min) up-front in a single batch
    const { data: stale } = await admin
      .from('event_reminders')
      .select('id')
      .eq('status', 'pending')
      .lte('fire_at', cutoffEarly);
    if (stale && stale.length) {
      await admin.from('event_reminders').update({ status: 'cancelled', error: 'stale' }).in('id', stale.map((s: { id: string }) => s.id));
    }

    for (const r of claimed as ReminderRow[]) {
      const ev = eventMap.get(r.event_id);
      if (!ev || ev.deleted_at) {
        await admin.from('event_reminders').update({ status: 'cancelled', error: 'event_missing' }).eq('id', r.id);
        skipped++;
        continue;
      }

      try {
        // Idempotent claim: only proceed if still pending
        const { data: stillPending } = await admin
          .from('event_reminders')
          .update({ status: 'sent', sent_at: now.toISOString() })
          .eq('id', r.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();
        if (!stillPending) { skipped++; continue; }

        const startAt = new Date(ev.start_time);
        const minutesUntil = Math.max(0, Math.round((startAt.getTime() - now.getTime()) / 60_000));
        const whenLabel = minutesUntil >= 60 ? `in ${Math.round(minutesUntil/60)}h` : minutesUntil > 0 ? `in ${minutesUntil} min` : 'now';
        const title = `Reminder: ${ev.title}`;
        const body = `Starts ${whenLabel}${ev.location ? ` • ${ev.location}` : ''}`;

        const { data: notif } = await admin.from('notifications').insert({
          user_id: r.user_id,
          type: 'event_reminder',
          title,
          body,
          reference_id: r.event_id,
          reference_type: 'calendar_event',
          is_read: false,
        }).select('id').single();

        await broadcastNotification(admin, r.user_id, {
          id: notif?.id,
          type: 'event_reminder',
          title,
          body,
          reference_id: r.event_id,
          reference_type: 'calendar_event',
          urgent: true,
        });

        await admin.from('audit_logs').insert({
          actor_id: 'system',
          action: 'reminder.dispatched',
          target_type: 'calendar_event',
          target_id: r.event_id,
          metadata: { reminder_id: r.id, user_id: r.user_id, channel: r.channel },
        });
        processed++;
      } catch (err) {
        await admin.from('event_reminders').update({ status: 'failed', error: err instanceof Error ? err.message : 'unknown' }).eq('id', r.id);
        await admin.from('audit_logs').insert({
          actor_id: 'system',
          action: 'reminder.failed',
          target_type: 'calendar_event',
          target_id: r.event_id,
          metadata: { reminder_id: r.id, error: err instanceof Error ? err.message : 'unknown' },
        });
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed, skipped, failed, claimed: claimed.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('reminders-dispatch error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
