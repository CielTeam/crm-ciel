import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    // LIST CONVERSATIONS
    if (action === 'list_conversations') {
      // Get user's conversation IDs
      const { data: memberships, error: mErr } = await admin
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', actor_id);

      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) {
        return new Response(JSON.stringify({ conversations: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const convIds = memberships.map(m => m.conversation_id);
      const readMap = new Map(memberships.map(m => [m.conversation_id, m.last_read_at]));

      // Get conversations
      const { data: convs, error: cErr } = await admin
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('updated_at', { ascending: false });

      if (cErr) throw cErr;

      // Get all members for these conversations (for display names)
      const { data: allMembers } = await admin
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', convIds);

      // Get last message per conversation
      const results = [];
      for (const conv of convs || []) {
        const { data: lastMsg } = await admin
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        // Count unread
        const lastRead = readMap.get(conv.id);
        let unreadCount = 0;
        if (lastRead) {
          const { count } = await admin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .is('deleted_at', null)
            .neq('sender_id', actor_id)
            .gt('created_at', lastRead);
          unreadCount = count || 0;
        }

        const members = (allMembers || [])
          .filter(m => m.conversation_id === conv.id)
          .map(m => m.user_id);

        results.push({
          ...conv,
          lastMessage: lastMsg?.[0] || null,
          unreadCount,
          memberIds: members,
        });
      }

      return new Response(JSON.stringify({ conversations: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET MESSAGES
    if (action === 'get_messages') {
      const { conversation_id, limit = 50, before } = payload;

      // Verify membership
      const { data: member } = await admin
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', actor_id)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let query = admin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ messages: (data || []).reverse() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SEND MESSAGE
    if (action === 'send_message') {
      const { conversation_id, content } = payload;

      if (!content?.trim()) {
        return new Response(JSON.stringify({ error: 'Empty message' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify membership
      const { data: member } = await admin
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', actor_id)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await admin.from('messages').insert({
        conversation_id,
        sender_id: actor_id,
        content: content.trim(),
      }).select().single();

      if (error) throw error;

      // Update conversation updated_at
      await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation_id);

      // Update sender's last_read_at
      await admin.from('conversation_members').update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversation_id)
        .eq('user_id', actor_id);

      return new Response(JSON.stringify({ message: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CREATE CONVERSATION
    if (action === 'create_conversation') {
      const { type = 'direct', name, member_ids } = payload;

      if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'member_ids required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For direct chats, check if conversation already exists
      if (type === 'direct' && member_ids.length === 1) {
        const otherUserId = member_ids[0];
        const { data: existing } = await admin
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', actor_id);

        if (existing) {
          for (const m of existing) {
            const { data: otherMember } = await admin
              .from('conversation_members')
              .select('conversation_id')
              .eq('conversation_id', m.conversation_id)
              .eq('user_id', otherUserId)
              .maybeSingle();

            if (otherMember) {
              const { data: conv } = await admin
                .from('conversations')
                .select('*')
                .eq('id', m.conversation_id)
                .eq('type', 'direct')
                .maybeSingle();

              if (conv) {
                return new Response(JSON.stringify({ conversation: conv, existing: true }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
          }
        }
      }

      const { data: conv, error } = await admin.from('conversations').insert({
        type,
        name: name || null,
        created_by: actor_id,
      }).select().single();

      if (error) throw error;

      // Add members including creator
      const allMembers = [...new Set([actor_id, ...member_ids])];
      const { error: mErr } = await admin.from('conversation_members').insert(
        allMembers.map(uid => ({ conversation_id: conv.id, user_id: uid }))
      );

      if (mErr) throw mErr;

      return new Response(JSON.stringify({ conversation: conv }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // MARK READ
    if (action === 'mark_read') {
      const { conversation_id } = payload;

      const { error } = await admin.from('conversation_members').update({
        last_read_at: new Date().toISOString(),
      }).eq('conversation_id', conversation_id).eq('user_id', actor_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('messages error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
