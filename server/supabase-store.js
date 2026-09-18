import { createClient } from "@supabase/supabase-js";

function required(name, env) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required for Supabase storage.`);
  return value;
}

/**
 * Persistence boundary for the API migration. The service-role key is only read
 * by server code and must never be sent to the browser.
 */
export function createSupabaseStore(env = process.env) {
  const client = createClient(
    required("SUPABASE_URL", env),
    required("SUPABASE_SERVICE_ROLE_KEY", env),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  async function records(kind) {
    const { data, error } = await client
      .from("records")
      .select("data")
      .eq("kind", kind);
    if (error) throw error;
    return data.map((row) => row.data);
  }

  async function record(kind, id) {
    const { data, error } = await client
      .from("records")
      .select("data")
      .eq("kind", kind)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  }

  async function putRecord(kind, value) {
    const { error } = await client
      .from("records")
      .upsert({ kind, id: value.id, data: value });
    if (error) throw error;
    return value;
  }

  async function deleteRecords(kind) {
    const { error } = await client.from("records").delete().eq("kind", kind);
    if (error) throw error;
  }

  async function findUserByEmail(email) {
    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function userForSession(token, now = Date.now()) {
    const { data, error } = await client
      .from("sessions")
      .select("user_id, expires, users(id,email,name,role)")
      .eq("token", token)
      .gt("expires", now)
      .maybeSingle();
    if (error) throw error;
    return data?.users || null;
  }

  return {
    client,
    records,
    record,
    putRecord,
    deleteRecords,
    findUserByEmail,
    userForSession,
  };
}