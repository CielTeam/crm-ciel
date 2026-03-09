import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const REVIEWER_ROLES = [
  'chairman', 'vice_president', 'hr',
  'head_of_operations', 'team_development_lead', 'technical_lead',
  'head_of_accounting', 'head_of_marketing', 'sales_lead',
];

const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid'];
const BALANCE_COLS: Record<string, { total: string; used: string }> = {
  annual: { total: 'annual', used: 'used_annual' },
  sick: { total: 'sick', used: 'used_sick' },
  personal: { total: 'personal', used: 'used_personal' },
};

function diffDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, actor_id, ...payload } = body;

    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'Missing actor_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // BALANCES
    if (action === 'balances') {
      let { data, error } = await admin.from('leave_balances').select('*').eq('user_id', actor_id).maybeSingle();

      if (!data && !error) {
        const { data: created, error: cErr } = await admin.from('leave_balances').insert({ user_id: actor_id }).select().single();
        if (cErr) throw cErr;
        data = created;
      }
      if (error) throw error;

      return new Response(JSON.stringify({ balances: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // LIST
    if (action === 'list') {
      const { include_team } = payload;
      let query = admin.from('leaves').select('*').is('deleted_at', null);

      if (include_team) {
        // For reviewers: get all non-deleted leaves
        // The frontend will filter based on role
      } else {
        query = query.eq('user_id', actor_id);
      }

      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ leaves: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CREATE
    if (action === 'create') {
      const { leave_type, start_date, end_date, reason } = payload;

      if (!LEAVE_TYPES.includes(leave_type)) {
        return new Response(JSON.stringify({ error: 'Invalid leave type' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!start_date || !end_date || new Date(end_date) < new Date(start_date)) {
        return new Response(JSON.stringify({ error: 'Invalid dates' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate balance (skip for unpaid)
      if (leave_type !== 'unpaid') {
        const cols = BALANCE_COLS[leave_type];
        let { data: bal } = await admin.from('leave_balances').select('*').eq('user_id', actor_id).maybeSingle();
        if (!bal) {
          const { data: created } = await admin.from('leave_balances').insert({ user_id: actor_id }).select().single();
          bal = created;
        }

        const days = diffDays(start_date, end_date);
        const remaining = (bal as any)[cols.total] - (bal as any)[cols.used];
        if (days > remaining) {
          return new Response(JSON.stringify({ error: `Insufficient ${leave_type} balance. ${remaining} days remaining.` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const { data, error } = await admin.from('leaves').insert({
        user_id: actor_id,
        leave_type,
        start_date,
        end_date,
        reason: reason || null,
      }).select().single();

      if (error) throw error;

      // Audit log
      await admin.from('audit_logs').insert({
        actor_id,
        action: 'leave.create',
        target_type: 'leave',
        target_id: data.id,
        metadata: { leave_type, start_date, end_date },
      });

      return new Response(JSON.stringify({ leave: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // REVIEW (approve / reject)
    if (action === 'review') {
      const { leave_id, decision, reviewer_note } = payload;

      if (!['approved', 'rejected'].includes(decision)) {
        return new Response(JSON.stringify({ error: 'Invalid decision' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check reviewer role
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', actor_id);
      const hasReviewerRole = roles?.some((r: any) => REVIEWER_ROLES.includes(r.role));
      if (!hasReviewerRole) {
        return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: leave } = await admin.from('leaves').select('*').eq('id', leave_id).single();
      if (!leave || leave.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Leave not found or not pending' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update leave
      const { data: updated, error } = await admin.from('leaves').update({
        status: decision,
        reviewer_id: actor_id,
        reviewed_at: new Date().toISOString(),
        reviewer_note: reviewer_note || null,
      }).eq('id', leave_id).select().single();

      if (error) throw error;

      // If approved, update balance
      if (decision === 'approved' && leave.leave_type !== 'unpaid') {
        const cols = BALANCE_COLS[leave.leave_type];
        const days = diffDays(leave.start_date, leave.end_date);

        const { data: bal } = await admin.from('leave_balances').select('*').eq('user_id', leave.user_id).single();
        if (bal) {
          await admin.from('leave_balances').update({
            [(cols.used)]: (bal as any)[cols.used] + days,
          }).eq('user_id', leave.user_id);
        }
      }

      // Audit log
      await admin.from('audit_logs').insert({
        actor_id,
        action: `leave.${decision}`,
        target_type: 'leave',
        target_id: leave_id,
        metadata: { decision, reviewer_note },
      });

      return new Response(JSON.stringify({ leave: updated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CANCEL
    if (action === 'cancel') {
      const { leave_id } = payload;

      const { data: leave } = await admin.from('leaves').select('*').eq('id', leave_id).single();
      if (!leave || leave.user_id !== actor_id || leave.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Cannot cancel this leave' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: updated, error } = await admin.from('leaves').update({
        status: 'cancelled',
      }).eq('id', leave_id).select().single();

      if (error) throw error;

      await admin.from('audit_logs').insert({
        actor_id,
        action: 'leave.cancel',
        target_type: 'leave',
        target_id: leave_id,
      });

      return new Response(JSON.stringify({ leave: updated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('leaves error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
