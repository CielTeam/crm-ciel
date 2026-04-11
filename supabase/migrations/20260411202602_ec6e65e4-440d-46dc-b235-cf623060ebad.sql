
SELECT cron.schedule(
  'leads-expiry-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://orkbfoviqjijcoqtihuu.supabase.co/functions/v1/leads-expiry-check',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ya2Jmb3ZpcWppamNvcXRpaHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTY0ODYsImV4cCI6MjA4ODU3MjQ4Nn0.UIc6gVF4KbqjfwXx5NdYYLcrHOoFgsdf5UEDG9B3Udk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
