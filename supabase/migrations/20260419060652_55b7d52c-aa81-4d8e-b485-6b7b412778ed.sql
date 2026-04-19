-- Enums
CREATE TYPE public.calendar_event_type_enum AS ENUM ('meeting', 'deadline', 'reminder', 'personal', 'block', 'ticket_due', 'task_due');
CREATE TYPE public.calendar_visibility_enum AS ENUM ('private', 'participants', 'department', 'management_chain');
CREATE TYPE public.reminder_channel_enum AS ENUM ('in_app', 'browser_push', 'email');
CREATE TYPE public.reminder_status_enum AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- calendar_events
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type public.calendar_event_type_enum NOT NULL DEFAULT 'meeting',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  location text,
  visibility public.calendar_visibility_enum NOT NULL DEFAULT 'private',
  created_by text NOT NULL,
  owner_user_id text NOT NULL,
  account_id uuid,
  ticket_id uuid,
  task_id uuid,
  recurrence_rule text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_calendar_events_start_time ON public.calendar_events(start_time);
CREATE INDEX idx_calendar_events_owner_start ON public.calendar_events(owner_user_id, start_time);
CREATE INDEX idx_calendar_events_account ON public.calendar_events(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX idx_calendar_events_ticket ON public.calendar_events(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_calendar_events_task ON public.calendar_events(task_id) WHERE task_id IS NOT NULL;

CREATE TRIGGER trg_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- calendar_event_participants
CREATE TABLE public.calendar_event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  response text NOT NULL DEFAULT 'pending',
  is_organizer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_calendar_event_participants_user ON public.calendar_event_participants(user_id, event_id);

-- event_reminders
CREATE TABLE public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  channel public.reminder_channel_enum NOT NULL DEFAULT 'in_app',
  offset_minutes integer NOT NULL,
  fire_at timestamptz NOT NULL,
  status public.reminder_status_enum NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_reminders_dispatch ON public.event_reminders(status, fire_at);
CREATE INDEX idx_event_reminders_user ON public.event_reminders(user_id);

-- RBAC helper
CREATE OR REPLACE FUNCTION public.has_event_access(_user_id text, _event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _e RECORD;
  _is_admin_or_exec boolean;
  _caller_dept uuid;
  _owner_dept uuid;
BEGIN
  SELECT created_by, owner_user_id, visibility INTO _e
  FROM calendar_events
  WHERE id = _event_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _e.created_by = _user_id OR _e.owner_user_id = _user_id THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM calendar_event_participants WHERE event_id = _event_id AND user_id = _user_id) THEN
    RETURN true;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('chairman', 'vice_president', 'head_of_operations', 'technical_lead', 'team_development_lead')
  ) INTO _is_admin_or_exec;
  IF _is_admin_or_exec THEN RETURN true; END IF;

  IF _e.visibility = 'department' THEN
    SELECT department_id INTO _caller_dept FROM profiles WHERE user_id = _user_id LIMIT 1;
    SELECT department_id INTO _owner_dept FROM profiles WHERE user_id = _e.owner_user_id LIMIT 1;
    IF _caller_dept IS NOT NULL AND _caller_dept = _owner_dept THEN RETURN true; END IF;
  END IF;

  IF _e.visibility = 'management_chain' THEN
    IF EXISTS (
      SELECT 1 FROM get_visible_user_ids(_user_id) v
      WHERE v.uid = _e.owner_user_id
    ) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$function$;

-- RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read calendar_events"
ON public.calendar_events FOR SELECT TO authenticated
USING (deleted_at IS NULL AND public.has_event_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), id));

CREATE POLICY "Service role manages calendar_events"
ON public.calendar_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read calendar_event_participants"
ON public.calendar_event_participants FOR SELECT TO authenticated
USING (public.has_event_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), event_id));

CREATE POLICY "Service role manages calendar_event_participants"
ON public.calendar_event_participants FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own reminders"
ON public.event_reminders FOR SELECT
USING (user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text));

CREATE POLICY "Service role manages event_reminders"
ON public.event_reminders FOR ALL TO service_role
USING (true) WITH CHECK (true);