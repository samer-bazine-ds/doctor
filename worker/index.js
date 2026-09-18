import { createClient } from "@supabase/supabase-js";
import {
  clock,
  getAvailableSlots,
  inactive,
  localDate,
  localTime,
  minutes,
  shiftQueue,
  validateSlot,
  zonedTimestamp,
} from "../scheduling.js";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(error) {
  return json({ error: error.message || "Une erreur est survenue." }, 400);
}

function store(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Supabase Worker secrets are not configured.");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function records(client, kind) {
  const { data, error } = await client.from("records").select("data").eq("kind", kind);
  if (error) throw error;
  return data.map((row) => row.data);
}

async function one(client, kind, id) {
  const values = await records(client, kind);
  return values.find((value) => value.id === id) || null;
}

async function put(client, kind, value) {
  const { error } = await client.from("records").upsert({
    kind,
    id: value.id,
    data: value,
  });
  if (error) throw error;
  return value;
}

async function broadcast(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic: "clinic-updates", event: "update", payload: {} }],
    }),
  });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function patientInput(input) {
  const patient = {
    firstName: clean(input.firstName, 80),
    lastName: clean(input.lastName, 80),
    phone: clean(input.phone, 30),
    email: clean(input.email, 160).toLowerCase(),
    dateOfBirth: clean(input.dateOfBirth, 10),
  };
  if (!patient.firstName || !patient.lastName || !/^\+?[\d ()-]{7,30}$/.test(patient.phone))
    throw Error("Saisissez un prénom, un nom et un numéro de téléphone valides.");
  if (!/^\S+@\S+\.\S+$/.test(patient.email)) throw Error("Saisissez une adresse e-mail valide.");
  return patient;
}

function staffOnly(user) {
  if (!user || !["ADMIN", "DOCTOR", "SECRETARIAT"].includes(user.role))
    throw Error("Un compte professionnel est nécessaire.");
  return user;
}

async function appointmentView(client, appointment) {
  const [patient, service, doctor, notifications] = await Promise.all([
    one(client, "patients", appointment.patientId),
    one(client, "services", appointment.serviceId),
    one(client, "settings", "clinic"),
    records(client, "notifications"),
  ]);
  const { accessToken, notes, ...safe } = appointment;
  return {
    ...safe,
    patient,
    service,
    doctor,
    notifications: notifications.filter(
      (notification) => notification.appointmentId === appointment.id && notification.recipient !== "STAFF",
    ),
  };
}

async function createBooking(client, env, input, publicBooking, user) {
  const data = await publicData(client);
  const service = data.services.find((item) => item.id === input.serviceId);
  if (!service) throw Error("Sélectionnez une prestation valide.");
  const duration = publicBooking ? service.duration : Number(input.duration || service.duration);
  const appointments = await records(client, "appointments");
  validateSlot(input.date, input.time, duration, appointments, data.doctor);
  const patient = {
    ...patientInput(input),
    id: crypto.randomUUID(),
    patientNumber: String((await records(client, "patients")).length + 1).padStart(4, "0"),
    createdAt: new Date().toISOString(),
  };
  await put(client, "patients", patient);
  const appointment = {
    id: crypto.randomUUID(),
    number: `PLS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    cancellationCode: `ANN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    accessToken: crypto.randomUUID().replaceAll("-", ""),
    patientId: patient.id,
    doctorId: "clinic",
    serviceId: service.id,
    date: input.date,
    timezone: data.doctor.timezone,
    scheduledStart: input.time,
    scheduledEnd: clock(minutes(input.time) + duration),
    estimatedStart: input.time,
    estimatedEnd: clock(minutes(input.time) + duration),
    duration,
    actualStart: null,
    actualEnd: null,
    status: "CONFIRMED",
    priority: publicBooking ? "Normal" : input.priority || "Normal",
    reason: clean(input.reason),
    notes: publicBooking ? "" : clean(input.notes, 2000),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  appointment.scheduledStartAt = zonedTimestamp(appointment.date, appointment.scheduledStart, appointment.timezone);
  appointment.scheduledEndAt = new Date(Date.parse(appointment.scheduledStartAt) + duration * 60000).toISOString();
  appointment.estimatedStartAt = appointment.scheduledStartAt;
  appointment.estimatedEndAt = appointment.scheduledEndAt;
  await put(client, "appointments", appointment);
  await put(client, "notifications", {
    id: crypto.randomUUID(),
    appointmentId: appointment.id,
    patientId: patient.id,
    message: `Votre rendez-vous est confirmé pour le ${appointment.date} à ${appointment.scheduledStart}.`,
    recipient: "PATIENT",
    createdAt: new Date().toISOString(),
    read: false,
    channel: "in-app",
  });
  await broadcast(env);
  return appointment;
}

async function publicData(client) {
  const settings = (await records(client, "settings"))[0];
  if (!settings) throw Error("Les paramètres du cabinet ne sont pas configurés.");
  return {
    doctor: settings,
    services: (await records(client, "services")).filter((service) => service.enabled),
    today: localDate(settings.timezone),
  };
}

function cookie(request, name) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}

async function currentUser(client, request, accessToken = cookie(request, "pulse_access")) {
  const token = accessToken;
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("name, role")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email,
    name: profile?.name || data.user.user_metadata?.name || data.user.email,
    role: profile?.role || "PATIENT",
  };
}

function authCookie(token, maxAge = 8 * 60 * 60) {
  return `pulse_access=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    throw Error("Corps de requête invalide.");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (url.pathname === "/api/health") return json({ ok: true, service: "pulse-clinic-api" });

    try {
      const client = store(env);
      if (url.pathname === "/api/me" && request.method === "GET")
        return json({ user: await currentUser(client, request) });

      if (url.pathname === "/api/login" && request.method === "POST") {
        const input = await body(request);
        const { data, error } = await client.auth.signInWithPassword({
          email: String(input.email || "").trim().toLowerCase(),
          password: String(input.password || ""),
        });
        if (error || !data.session) throw Error("Adresse e-mail ou mot de passe incorrect.");
        const user = await currentUser(client, request, data.session.access_token);
        return json({ user }, 200, { "Set-Cookie": authCookie(data.session.access_token) });
      }

      if (url.pathname === "/api/register" && request.method === "POST") {
        const input = await body(request);
        if (!input.name || !/^\S+@\S+\.\S+$/.test(input.email || "") || String(input.password || "").length < 12)
          throw Error("Saisissez votre nom, un e-mail valide et un mot de passe d’au moins 12 caractères.");
        const { error } = await client.auth.signUp({
          email: String(input.email).trim().toLowerCase(),
          password: String(input.password),
          options: { data: { name: String(input.name).trim(), role: "PATIENT" } },
        });
        if (error) throw error;
        return json({ ok: true });
      }

      if (url.pathname === "/api/logout" && request.method === "POST")
        return json({ ok: true }, 200, { "Set-Cookie": authCookie("", 0) });

      if (url.pathname === "/api/public" && request.method === "GET")
        return json(await publicData(client));

      if (url.pathname === "/api/slots" && request.method === "GET") {
        const data = await publicData(client);
        const service = data.services.find((item) => item.id === url.searchParams.get("service"));
        if (!service) return json({ error: "Sélectionnez une prestation disponible." }, 400);
        const date = url.searchParams.get("date");
        if (!date || date < data.today) return json([]);
        const appointments = await records(client, "appointments");
        const slots = getAvailableSlots(date, service.duration, appointments, data.doctor).filter(
          (time) => date !== data.today || time > localTime(data.doctor.timezone),
        );
        return json(slots);
      }

      if (url.pathname === "/api/book" && request.method === "POST") {
        const appointment = await createBooking(client, env, await body(request), true, null);
        return json({
          id: appointment.id,
          token: appointment.accessToken,
          number: appointment.number,
          cancellationCode: appointment.cancellationCode,
        });
      }

      if (url.pathname === "/api/cancel-by-code" && request.method === "POST") {
        const input = await body(request);
        const appointments = await records(client, "appointments");
        const appointment = appointments.find(
          (item) => item.cancellationCode === clean(input.cancellationCode, 40).toUpperCase(),
        );
        if (!appointment) throw Error("Code d’annulation invalide ou rendez-vous introuvable.");
        if (inactive.includes(appointment.status)) throw Error("Ce rendez-vous ne peut plus être annulé.");
        appointment.status = "CANCELLED";
        appointment.updatedAt = new Date().toISOString();
        await put(client, "appointments", appointment);
        await broadcast(env);
        return json({ ok: true, message: "Votre rendez-vous a été annulé." });
      }

      const user = await currentUser(client, request);
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        staffOnly(user);
        const [appointments, patients, settings, services, notifications, audit] = await Promise.all([
          records(client, "appointments"),
          records(client, "patients"),
          one(client, "settings", "clinic"),
          records(client, "services"),
          records(client, "notifications"),
          records(client, "audit"),
        ]);
        return json({
          appointments: appointments.map(({ accessToken, ...appointment }) => ({
            ...appointment,
            patient: patients.find((patient) => patient.id === appointment.patientId),
            service: services.find((service) => service.id === appointment.serviceId),
          })),
          patients,
          settings,
          services,
          notifications,
          audit: audit.reverse(),
          today: localDate(settings.timezone),
          user,
        });
      }

      const appointmentMatch = url.pathname.match(/^\/api\/appointment\/([^/]+)(\/cancel)?$/);
      if (appointmentMatch && !appointmentMatch[2] && request.method === "GET") {
        const appointment = await one(client, "appointments", appointmentMatch[1]);
        const token = url.searchParams.get("token");
        if (!appointment || appointment.accessToken !== token) return json({ error: "Rendez-vous introuvable." }, 404);
        return json(await appointmentView(client, appointment));
      }

      if (appointmentMatch && appointmentMatch[2] && request.method === "POST") {
        const appointment = await one(client, "appointments", appointmentMatch[1]);
        const input = await body(request);
        const token = url.searchParams.get("token") || input.token;
        if (!appointment || (appointment.accessToken !== token && !user))
          return json({ error: "Rendez-vous introuvable." }, 404);
        if (inactive.includes(appointment.status) || appointment.status === "IN_CONSULTATION")
          throw Error("Ce rendez-vous ne peut plus être annulé.");
        appointment.status = "CANCELLED";
        appointment.updatedAt = new Date().toISOString();
        await put(client, "appointments", appointment);
        await put(client, "notifications", {
          id: crypto.randomUUID(),
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          message: "Votre rendez-vous a été annulé.",
          recipient: "PATIENT",
          createdAt: new Date().toISOString(),
          read: false,
          channel: "in-app",
        });
        await broadcast(env);
        return json({ ok: true });
      }

      const updateMatch = url.pathname.match(/^\/api\/appointments\/([^/]+)$/);
      if (updateMatch && request.method === "PATCH") {
        staffOnly(user);
        const appointment = await one(client, "appointments", updateMatch[1]);
        if (!appointment) return json({ error: "Rendez-vous introuvable." }, 404);
        const input = await body(request);
        const settings = await one(client, "settings", "clinic");
        const appointments = await records(client, "appointments");
        if (input.status) appointment.status = input.status;
        if (input.date || input.time || input.duration) {
          const date = input.date || appointment.date;
          const time = input.time || appointment.scheduledStart;
          const duration = Number(input.duration || appointment.duration);
          validateSlot(date, time, duration, appointments, settings, appointment.id);
          appointment.date = date;
          appointment.scheduledStart = time;
          appointment.duration = duration;
          appointment.scheduledEnd = clock(minutes(time) + duration);
          appointment.estimatedStart = time;
          appointment.estimatedEnd = appointment.scheduledEnd;
          appointment.scheduledStartAt = zonedTimestamp(date, time, appointment.timezone || settings.timezone);
          appointment.scheduledEndAt = new Date(Date.parse(appointment.scheduledStartAt) + duration * 60000).toISOString();
          appointment.estimatedStartAt = appointment.scheduledStartAt;
          appointment.estimatedEndAt = appointment.scheduledEndAt;
          appointment.status = "RESCHEDULED";
        }
        if (input.notes !== undefined) appointment.notes = clean(input.notes, 2000);
        if (input.priority) appointment.priority = input.priority;
        appointment.updatedAt = new Date().toISOString();
        await put(client, "appointments", appointment);
        await broadcast(env);
        return json({ ok: true });
      }

      if (url.pathname === "/api/queue" && request.method === "POST") {
        staffOnly(user);
        const input = await body(request);
        const settings = await one(client, "settings", "clinic");
        const appointments = await records(client, "appointments");
        const changes = shiftQueue(appointments, input.date, input.start, settings, input.onlyNext);
        for (const change of changes) {
          const appointment = appointments.find((item) => item.id === change.id);
          appointment.estimatedStart = change.estimatedStart;
          appointment.estimatedEnd = clock(minutes(change.estimatedStart) + appointment.duration);
          appointment.estimatedStartAt = zonedTimestamp(appointment.date, appointment.estimatedStart, appointment.timezone || settings.timezone);
          appointment.estimatedEndAt = new Date(Date.parse(appointment.estimatedStartAt) + appointment.duration * 60000).toISOString();
          appointment.updatedAt = new Date().toISOString();
          await put(client, "appointments", appointment);
        }
        await broadcast(env);
        return json({ ok: true, changes });
      }

      if (url.pathname === "/api/notifications/read" && request.method === "POST") {
        staffOnly(user);
        for (const notification of await records(client, "notifications")) {
          notification.read = true;
          await put(client, "notifications", notification);
        }
        await broadcast(env);
        return json({ ok: true });
      }

      if (url.pathname === "/api/settings" && request.method === "PUT") {
        staffOnly(user);
        const settings = await one(client, "settings", "clinic");
        if (!settings) throw Error("Les paramètres du cabinet ne sont pas configurés.");
        const input = await body(request);
        const next = {
          ...settings,
          ...input,
          id: "clinic",
          timezone: input.timezone || settings.timezone,
        };
        await put(client, "settings", next);
        await broadcast(env);
        return json({ ok: true });
      }

      if (url.pathname === "/api/services" && request.method === "POST") {
        staffOnly(user);
        const input = await body(request);
        if (!clean(input.name) || !Number.isInteger(Number(input.duration)) || Number(input.duration) < 5)
          throw Error("Saisissez un nom et une durée valide.");
        const service = {
          id: input.id || crypto.randomUUID(),
          name: clean(input.name, 120),
          description: clean(input.description, 500),
          duration: Number(input.duration),
          price: Number(input.price || 0),
          enabled: input.enabled !== false,
        };
        await put(client, "services", service);
        await broadcast(env);
        return json({ ok: true, service });
      }

      if (url.pathname === "/api/users" && request.method === "GET") {
        if (user?.role !== "ADMIN") throw Error("Un accès administrateur est nécessaire.");
        const { data, error } = await client.from("profiles").select("id,name,role");
        if (error) throw error;
        return json(data || []);
      }

      if (url.pathname === "/api/users" && request.method === "POST") {
        if (user?.role !== "ADMIN") throw Error("Un accès administrateur est nécessaire.");
        const input = await body(request);
        if (!["ADMIN", "DOCTOR", "SECRETARIAT"].includes(input.role) || !clean(input.name) || String(input.password || "").length < 12)
          throw Error("Saisissez un nom, un rôle et un mot de passe d’au moins 12 caractères.");
        const { data, error } = await client.auth.admin.createUser({
          email: String(input.email || "").trim().toLowerCase(),
          password: String(input.password),
          email_confirm: true,
          user_metadata: { name: clean(input.name, 100), role: input.role },
        });
        if (error) throw error;
        return json({ ok: true, id: data.user.id });
      }

      if (url.pathname === "/api/data/clear" && request.method === "POST") {
        if (user?.role !== "ADMIN") throw Error("Un accès administrateur est nécessaire.");
        for (const kind of ["patients", "appointments", "notifications", "audit"])
          await client.from("records").delete().eq("kind", kind);
        await broadcast(env);
        return json({ ok: true });
      }

      if (url.pathname === "/api/appointments" && request.method === "POST") {
        staffOnly(user);
        return json({ id: (await createBooking(client, env, await body(request), false, user)).id });
      }

      return json({ error: "Ressource introuvable." }, 404);
    } catch (error) {
      console.error(error);
      return errorResponse(error);
    }
  },
};
