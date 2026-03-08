-- Seed profile for boutros.georges513@gmail.com
INSERT INTO public.profiles (user_id, email, display_name, status)
VALUES ('pending|boutros.georges513@gmail.com', 'boutros.georges513@gmail.com', 'Boutros Georges', 'active');

-- Seed role
INSERT INTO public.user_roles (user_id, role)
VALUES ('pending|boutros.georges513@gmail.com', 'team_development_lead');