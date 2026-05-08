import { createClient } from '@supabase/supabase-js';

// anon 키는 공개용 키로 하드코딩해도 안전
export const supabase = createClient(
  'https://kkoolaaxtaotxmsfvkou.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrb29sYWF4dGFvdHhtc2Z2a291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjg4NzgsImV4cCI6MjA5MzY0NDg3OH0.NplPM8frGwKb_VR7vCGZ7iv5Qb8ynWlFo132tzNElzo'
);
