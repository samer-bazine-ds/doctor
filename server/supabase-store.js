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

  async function users() {
    const { data, error } = await client.from("users").select("*");
    if (error) throw error;
    return data;
  }

  async function sessions() {
    const { data, error } = await client.from("sessions").select("*");
    if (error) throw error;
    return data;
  }

  async function putUser(user) {
    const { error } = await client.from("users").upsert({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      salt: user.salt,
      hash: user.hash,
    });
    if (error) throw error;
  }

  async function putSession(token, userId, expires) {
    const { error } = await client.from("sessions").upsert({
      token,
      user_id: userId,
      expires,
    });
    if (error) throw error;
  }

  async function deleteSession(token) {
    const { error } = await client.from("sessions").delete().eq("token", token);
    if (error) throw error;
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
    users,
    sessions,
    putUser,
    putSession,
    deleteSession,
    userForSession,
  };
}