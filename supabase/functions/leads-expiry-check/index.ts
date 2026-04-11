import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ROLES = ['chairman', 'vice_president', 'head_of_operations'];
const EXPIRY_WINDOWS = [60, 30, 15, 7, 3, 1];

async function broadcastNotification(admin: ReturnType<typeof createClient>, userId: string, notification: Record<string, unknown>) {
  try {
    const channel = admin.channel(`user-notify-${userId}`);
    await channel.send({ type: 'broadcast', event: 'new_notification', payload: notification });
    await admin.removeChannel(channel);
  } catch { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get all users who should receive lead expiry notifications
    const { data: roleRows } = await admin.from('user_roles').select('user_id, role');
    const targetUserIds = [...new Set(
      (roleRows || [])
        .filter((r: { role: string }) => ALLOWED_ROLES.includes(r.role))
        .map((r: { user_id: string }) => r.user_id)
    )];

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No target users' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const today = new Date();
    let totalNotifications = 0;

    for (const window of EXPIRY_WINDOWS) {
      const targetDate = new Date(today.getTime() + window * 86400000);
      const dateStr = targetDate.toISOString().slice(0, 10);

      // Find services expiring exactly on this date
      const { data: services } = await admin.from('lead_services')
        .select('id, service_name, lead_id, expiry_date')
        .eq('status', 'active')
        .is('deleted_at', null)
        .eq('expiry_date', dateStr);

      if (!services || services.length === 0) continue;

      // Get lead info for each service
      const leadIds = [...new Set(services.map((s: { lead_id: string }) => s.lead_id))];
      const { data: leads } = await admin.from('leads').select('id, company_name').in('id', leadIds).is('deleted_at', null);
      const leadMap = new Map((leads || []).map((l: { id: string; company_name: string }) => [l.id, l.company_name]));

      for (const service of services) {
        const companyName = leadMap.get(service.lead_id) || 'Unknown';
        const isUrgent = window <= 3;
        const title = `Service expiring in ${window} day${window !== 1 ? 's' : ''}`;
        const body = `"${service.service_name}" for ${companyName} expires on ${service.expiry_date}`;

        for (const userId of targetUserIds) {
          // Check if we already sent this notification today (avoid duplicates)
          const todayStart = today.toISOString().slice(0, 10);
          const { count } = await admin.from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'lead_expiry')
            .eq('reference_id', service.id)
            .gte('created_at', todayStart);

          if ((count || 0) > 0) continue;

          const notif = {
            user_id: userId,
            type: 'lead_expiry',
            title: isUrgent ? `⚠️ ${title}` : title,
            body,
            reference_id: service.lead_id,
            reference_type: 'lead',
          };

          await admin.from('notifications').insert(notif);
          await broadcastNotification(admin, userId, notif);
          totalNotifications++;
        }
      }
    }

    return new Response(JSON.stringify({ message: `Sent ${totalNotifications} expiry notifications` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('leads-expiry-check error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
