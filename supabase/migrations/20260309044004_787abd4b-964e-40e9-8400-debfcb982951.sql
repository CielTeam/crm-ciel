
-- Leaves table
CREATE TABLE public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'annual',
  status TEXT NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  reviewer_id TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Leave balances table
CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  annual INT NOT NULL DEFAULT 21,
  sick INT NOT NULL DEFAULT 10,
  personal INT NOT NULL DEFAULT 5,
  used_annual INT NOT NULL DEFAULT 0,
  used_sick INT NOT NULL DEFAULT 0,
  used_personal INT NOT NULL DEFAULT 0,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'direct',
  name TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation members table
CREATE TABLE public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Updated_at triggers
CREATE TRIGGER handle_leaves_updated_at BEFORE UPDATE ON public.leaves FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_leave_balances_updated_at BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS on leaves
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages leaves" ON public.leaves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own leaves" ON public.leaves FOR SELECT USING (user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'));

-- RLS on leave_balances
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages leave_balances" ON public.leave_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own balance" ON public.leave_balances FOR SELECT USING (user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'));

-- RLS on conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages conversations" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Members can read conversations" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'))
);

-- RLS on conversation_members
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages conversation_members" ON public.conversation_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Members can read own memberships" ON public.conversation_members FOR SELECT USING (user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'));

-- RLS on messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Members can read conversation messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'))
  AND deleted_at IS NULL
);
