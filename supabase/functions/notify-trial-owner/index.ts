import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createNotificationHandler } from './handler.ts';

Deno.serve(createNotificationHandler({
  env: (name) => Deno.env.get(name),
  createClient,
  fetch,
}));
