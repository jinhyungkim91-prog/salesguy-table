import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.REACT_APP_SUPABASE_URL || 'https://kkoolaaxtaotxmsfvkou.supabase.co').trim();
const SUPABASE_ANON_KEY = (process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrb29sYWF4dGFvdHhtc2Z2a291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjg4NzgsImV4cCI6MjA5MzY0NDg3OH0.NplPM8frGwKb_VR7vCGZ7iv5Qb8ynWlFo132tzNElzo').trim();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
