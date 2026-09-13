import express from "express";
import initSqlJs from "sql.js";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import {
  getAvailableSlots,
  validateSlot,
  shiftQueue,
  localDate,
  localTime,
  inactive,
  minutes,
  clock,
  zonedTimestamp,
  statusLabel,
} from "./scheduling.js";

/**
 * Serveur du cabinet : base SQLite, connexion, réservations et notifications.
 * Les contrôles restent côté serveur, même si le navigateur affiche un créneau libre.
 */

// Ces deux petites fonctions sont regroupées ici pour limiter les fichiers sources.
function configuredPublicOrigin(env = process.env) {
  if (env.PUBLIC_ORIGIN) return new URL(env.PUBLIC_ORIGIN).origin;
  if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${env.CODESPACE_NAME}-${env.PORT || 3000}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return "";
}

function isAllowedOrigin(headers, publicOrigin = "") {
  if (!headers.origin) return true;
  try {
    const origin = new URL(headers.origin);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== headers.origin
    )
      return false;
    if (publicOrigin && origin.origin === new URL(publicOrigin).origin) return true;
    return origin.host === headers.host;
  } catch {
    return false;
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
const httpServer = createHttpServer(app);
const publicOrigin = configuredPublicOrigin();
const io = new SocketServer(httpServer, {
  serveClient: false,
  allowRequest: (req, done) => done(null, isAllowedOrigin(req.headers, publicOrigin)),
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    !isAllowedOrigin(req.headers, publicOrigin)
  )
    return res
      .status(403)
      .json({ error: "L’origine de cette requête n’est pas autorisée." });
  next();
});
// PERSISTANCE : base privée locale, ignorée par Git.
fs.mkdirSync("data", { recursive: true });
const SQL = await initSqlJs();
const db = new SQL.Database(
  fs.existsSync("data/clinic.sqlite") ? fs.readFileSync("data/clinic.sqlite") : undefined,
);
db.run(
  `CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,salt TEXT,hash TEXT); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,userId TEXT,expires INTEGER);`,
);
// Écriture atomique du fichier SQLite : le fichier temporaire remplace le précédent.
function save() {
  const tmp = "data/clinic.sqlite.tmp";
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, "data/clinic.sqlite");
}
// Lecture d’une collection logique (patients, rendez-vous, prestations, etc.).
const all = (kind) => {
  const stmt = db.prepare("SELECT data FROM records WHERE kind=?");
  stmt.bind([kind]);
  const rows = [];
  while (stmt.step()) rows.push(JSON.parse(stmt.getAsObject().data));
  stmt.free();
  return rows;
};
// Enregistrement unique : les heures de rendez-vous sont également conservées en UTC.
const put = (kind, obj) => {
  if (kind === "appointments") {
    if (["ARRIVED", "WAITING"].includes(obj.status) && !obj.arrivedAt)
      obj.arrivedAt = new Date().toISOString();
    obj.timezone = obj.timezone || settings().timezone;
    obj.scheduledStartAt = zonedTimestamp(obj.date, obj.scheduledStart, obj.timezone);
    obj.scheduledEndAt = new Date(
      Date.parse(obj.scheduledStartAt) + obj.duration * 60000,
    ).toISOString();
    obj.estimatedStartAt = zonedTimestamp(obj.date, obj.estimatedStart, obj.timezone);
    obj.estimatedEndAt = new Date(
      Date.parse(obj.estimatedStartAt) + obj.duration * 60000,
    ).toISOString();
  }
  db.run("INSERT OR REPLACE INTO records VALUES (?,?,?)", [
    kind,
    obj.id,
    JSON.stringify(obj),
  ]);
};
const one = (kind, id) => all(kind).find((a) => a.id === id);
const id = () => crypto.randomUUID();
const hash = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
// Du samedi au vendredi : les sept jours sont ouverts de 08:00 à 17:00.
// La pause déjeuner reste protégée et peut être changée dans « Horaires ».
const defaultDays = Array.from({ length: 7 }, () => ({
  enabled: true,
  start: "08:00",
  end: "17:00",
  breakStart: "12:00",
  breakEnd: "13:00",
}));
if (!all("settings").length) {
  put("settings", {
    id: "clinic",
    name: "Dr. Ahmed Benali",
    specialty: "Cardiologue",
    timezone: "Africa/Algiers",
    duration: 60,
    address: "Alger, Algérie",
    phone: "+213 555 12 34 56",
    email: "contact@cabinet-benali.example",
    days: defaultDays,
    holidays: [],
    reminders: [24, 2],
    currency: "DZD",
    locale: "fr-DZ",
    regionalVersion: 2,
  });
  for (const s of [
    {
      name: "Première consultation",
      description:
        "Un premier échange pour faire le point sur votre santé cardiovasculaire.",
      duration: 60,
      price: 5000,
    },
    {
      name: "Consultation de suivi",
      description:
        "Un rendez-vous pour suivre votre évolution et adapter votre prise en charge.",
      duration: 30,
      price: 3000,
    },
    {
      name: "Bilan cardiovasculaire",
      description:
        "Une consultation dédiée à la prévention et au bilan de votre santé cardiaque.",
      duration: 60,
      price: 7000,
    },
  ])
    put("services", { ...s, id: id(), enabled: true });
  save();
}
const settings = () => one("settings", "clinic");

/**
 * Migration unique des anciens exemples vers l’Algérie.
 * Les patients, leurs rendez-vous et les prestations personnalisées sont conservés.
 * Les tarifs ci-dessous remplacent uniquement les anciens tarifs d’exemple inchangés.
 */
if (settings().regionalVersion !== 2) {
  if (
    fs.existsSync("data/clinic.sqlite") &&
    !fs.existsSync("data/clinic.before-algeria.sqlite")
  ) {
    fs.copyFileSync("data/clinic.sqlite", "data/clinic.before-algeria.sqlite");
  }
  const previous = settings();
  put("settings", {
    ...previous,
    specialty: previous.specialty === "Cardiologist" ? "Cardiologue" : previous.specialty,
    address: previous.address.includes("Nigeria") ? "Alger, Algérie" : previous.address,
    phone: previous.phone.startsWith("+234") ? "+213 555 12 34 56" : previous.phone,
    email:
      previous.email === "hello@pulseclinic.example"
        ? "contact@cabinet-benali.example"
        : previous.email,
    timezone: "Africa/Algiers",
    currency: "DZD",
    locale: "fr-DZ",
    days: defaultDays,
    regionalVersion: 2,
  });
  const services = {
    "Initial consultation": {
      name: "Première consultation",
      description:
        "Un premier échange pour faire le point sur votre santé cardiovasculaire.",
      oldPrice: 150,
      price: 5000,
    },
    "Follow-up visit": {
      name: "Consultation de suivi",
      description:
        "Un rendez-vous pour suivre votre évolution et adapter votre prise en charge.",
      oldPrice: 75,
      price: 3000,
    },
    "Heart health check-up": {
      name: "Bilan cardiovasculaire",
      description:
        "Une consultation dédiée à la prévention et au bilan de votre santé cardiaque.",
      oldPrice: 180,
      price: 7000,
    },
  };
  for (const service of all("services")) {
    const translation = services[service.name];
    if (translation)
      put("services", {
        ...service,
        name: translation.name,
        description: translation.description,
        price: service.price === translation.oldPrice ? translation.price : service.price,
      });
  }
  for (const appointment of all("appointments")) {
    put("appointments", { ...appointment, timezone: "Africa/Algiers" });
  }
  // Seuls les anciens messages automatiques sont traduits, jamais les notes des patients.
  for (const notification of all("notifications")) {
    const message = notification.message
      .replace(
        /^Your appointment is confirmed for (.+) at (.+)\.$/,
        "Votre rendez-vous est confirmé pour le $1 à $2.",
      )
      .replace(
        /^Your appointment has been cancelled\.$/,
        "Votre rendez-vous a été annulé.",
      )
      .replace(/^The doctor is ready for you\.$/, "Le médecin est prêt à vous recevoir.")
      .replace(
        /^Your estimated appointment time has changed to (.+)\.$/,
        "Votre nouvel horaire estimé de rendez-vous est $1.",
      )
      .replace(
        /^Your appointment was updated: (.+)\. Estimated time: (.+)\.$/,
        (_, status, time) =>
          `Votre rendez-vous a été mis à jour : ${statusLabel(status.toUpperCase().replaceAll(" ", "_")).toLowerCase()}. Horaire estimé : ${time}.`,
      )
      .replace(
        /^Reminder: your appointment is on (.+) at (.+) \((.+)\)\.$/,
        "Rappel : votre rendez-vous est prévu le $1 à $2 (Africa/Algiers).",
      );
    put("notifications", { ...notification, message });
  }
  const auditActions = {
    "Appointment booked": "Rendez-vous réservé",
    "Appointment updated": "Rendez-vous mis à jour",
    "Appointment cancelled": "Rendez-vous annulé",
    "Queue time changed": "Horaire de la file modifié",
    "Practice settings updated": "Paramètres du cabinet modifiés",
    "Service saved": "Prestation enregistrée",
    "Staff account created": "Compte professionnel créé",
  };
  for (const entry of all("audit")) {
    put("audit", {
      ...entry,
      action: auditActions[entry.action] || entry.action,
      actor:
        entry.actor === "Practice administrator"
          ? "Administrateur du cabinet"
          : entry.actor,
    });
  }
  db.run("UPDATE users SET name = ? WHERE name = ?", [
    "Administrateur du cabinet",
    "Practice administrator",
  ]);
  save();
}
let initialPassword;
if (!db.exec("SELECT id FROM users LIMIT 1").length) {
  initialPassword =
    process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString("base64url");
  const salt = crypto.randomBytes(16).toString("hex");
  db.run("INSERT INTO users VALUES (?,?,?,?,?,?)", [
    id(),
    process.env.ADMIN_EMAIL || "admin@pulse.local",
    "Administrateur du cabinet",
    "ADMIN",
    salt,
    hash(initialPassword, salt),
  ]);
  save();
  console.log(
    `Première connexion administrateur : ${process.env.ADMIN_EMAIL || "admin@pulse.local"} / ${initialPassword}`,
  );
}
// TEMPS RÉEL : les événements signalent un changement sans diffuser de données personnelles.
const clients = new Set();
function emit() {
  for (const c of clients) c.res.write("event: update\ndata: {}\n\n");
  io.emit("update", {});
}
function audit(req, action, before, after) {
  put("audit", {
    id: id(),
    at: new Date().toISOString(),
    actor: req.user?.name || "Patient",
    action,
    before,
    after,
  });
}
function notify(a, message) {
  put("notifications", {
    id: id(),
    appointmentId: a.id,
    patientId: a.patientId,
    message,
    createdAt: new Date().toISOString(),
    read: false,
    channel: "in-app",
    emailStatus: process.env.EMAIL_WEBHOOK ? "pending" : "not-configured",
  });
}
// La validation et l’écriture sont exécutées ensemble pour empêcher les doubles réservations.
function transaction(fn) {
  db.run("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.run("COMMIT");
    save();
    emit();
    return result;
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
}
// AUTHENTIFICATION : le navigateur possède un jeton opaque ; seul son hash est stocké.
function userFor(req) {
  const token = (req.headers.cookie || "")
    .split("; ")
    .find((v) => v.startsWith("pulse_session="))
    ?.split("=")[1];
  if (!token) return null;
  const rows = db.exec(
    "SELECT u.id,u.email,u.name,u.role FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expires>?",
    [crypto.createHash("sha256").update(token).digest("hex"), Date.now()],
  );
  if (!rows.length) return null;
  return Object.fromEntries(rows[0].columns.map((k, i) => [k, rows[0].values[0][i]]));
}
app.use("/api", (req, res, next) => {
  req.user = userFor(req);
  next();
});
io.use((socket, next) => {
  const user = userFor(socket.request),
    token = socket.handshake.auth?.token;
  if (user || all("appointments").some((a) => a.accessToken === token)) {
    socket.data.user = user;
    next();
  } else next(new Error("Une connexion est nécessaire."));
});
io.on("connection", (socket) => {
  const timer = setInterval(() => {
    if (socket.data.user && !userFor(socket.request)) socket.disconnect(true);
  }, 20000);
  socket.on("disconnect", () => clearInterval(timer));
});
const requireAuth = (req, res, next) =>
  req.user
    ? next()
    : res.status(401).json({
        error: "Connectez-vous pour accéder au tableau de bord du cabinet.",
      });
const staff = (req, res, next) =>
  req.user && ["ADMIN", "DOCTOR", "SECRETARIAT"].includes(req.user.role)
    ? next()
    : res.status(403).json({ error: "Un compte professionnel est nécessaire." });
const admin = (req, res, next) =>
  req.user?.role === "ADMIN"
    ? next()
    : res.status(403).json({ error: "Un accès administrateur est nécessaire." });
const route = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
const limits = new Map();
function limit(req, res, next) {
  const key = req.ip + req.path;
  const record = limits.get(key) || { n: 0, à: Date.now() };
  if (Date.now() - record.at > 600000) {
    record.n = 0;
    record.at = Date.now();
  }
  record.n++;
  limits.set(key, record);
  if (record.n > 30)
    return res.status(429).json({
      error: "Trop de tentatives. Veuillez réessayer dans 10 minutes.",
    });
  next();
}
const clean = (v, max = 500) =>
  String(v || "")
    .trim()
    .slice(0, max);
// Coordonnées minimales ; aucun dossier médical n’est créé par cette application.
function patientInput(b) {
  const p = {
    firstName: clean(b.firstName, 80),
    lastName: clean(b.lastName, 80),
    phone: clean(b.phone, 30),
    email: clean(b.email, 160).toLowerCase(),
    dateOfBirth: clean(b.dateOfBirth, 10),
  };
  if (
    !p.firstName ||
    !p.lastName ||
    !/^\+?[\d ()-]{7,30}$/.test(p.phone) ||
    !/^\S+@\S+\.\S+$/.test(p.email)
  )
    throw Error(
      "Saisissez un prénom, un nom, un numéro de téléphone et une adresse e-mail valides.",
    );
  if (
    p.dateOfBirth &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth) ||
      p.dateOfBirth > localDate(settings().timezone))
  )
    throw Error("Saisissez une date de naissance valide.");
  return p;
}
app.get("/api/me", (req, res) => res.json({ user: req.user }));
app.post(
  "/api/login",
  limit,
  route((req, res) => {
    const row = db.exec("SELECT * FROM users WHERE email=?", [
      clean(req.body.email).toLowerCase(),
    ]);
    if (!row.length) throw Error("Adresse e-mail ou mot de passe incorrect.");
    const u = Object.fromEntries(row[0].columns.map((k, i) => [k, row[0].values[0][i]]));
    if (
      !crypto.timingSafeEqual(
        Buffer.from(hash(String(req.body.password || ""), u.salt), "hex"),
        Buffer.from(u.hash, "hex"),
      )
    )
      throw Error("Adresse e-mail ou mot de passe incorrect.");
    const token = crypto.randomBytes(32).toString("hex");
    db.run("INSERT INTO sessions VALUES (?,?,?)", [
      crypto.createHash("sha256").update(token).digest("hex"),
      u.id,
      Date.now() + 8 * 3600000,
    ]);
    save();
    res.cookie("pulse_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 3600000,
    });
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  }),
);
app.post(
  "/api/register",
  limit,
  route((req, res) => {
    const b = req.body;
    if (
      !/^\S+@\S+\.\S+$/.test(b.email || "") ||
      String(b.password || "").length < 12 ||
      !clean(b.name)
    )
      throw Error(
        "Saisissez votre nom, un e-mail valide et un mot de passe d’au moins 12 caractères.",
      );
    const salt = crypto.randomBytes(16).toString("hex");
    try {
      db.run("INSERT INTO users VALUES (?,?,?,?,?,?)", [
        id(),
        clean(b.email).toLowerCase(),
        clean(b.name, 100),
        "PATIENT",
        salt,
        hash(b.password, salt),
      ]);
      save();
    } catch {
      throw Error("Un compte existe déjà avec cette adresse e-mail.");
    }
    res.json({ ok: true });
  }),
);
app.post("/api/logout", (req, res) => {
  const token = (req.headers.cookie || "")
    .split("; ")
    .find((v) => v.startsWith("pulse_session="))
    ?.split("=")[1];
  if (token) {
    db.run("DELETE FROM sessions WHERE token=?", [
      crypto.createHash("sha256").update(token).digest("hex"),
    ]);
    save();
  }
  res.clearCookie("pulse_session");
  res.json({ ok: true });
});
app.get("/api/public", (req, res) =>
  res.json({
    doctor: settings(),
    services: all("services").filter((s) => s.enabled),
    today: localDate(settings().timezone),
  }),
);
app.get(
  "/api/slots",
  route((req, res) => {
    const service = one("services", req.query.service);
    if (!service?.enabled) throw Error("Sélectionnez une prestation disponible.");
    const date = req.query.date;
    if (date < localDate(settings().timezone)) return res.json([]);
    const slots = getAvailableSlots(
      date,
      service.duration,
      all("appointments"),
      settings(),
    ).filter(
      (t) =>
        date !== localDate(settings().timezone) || t > localTime(settings().timezone),
    );
    res.json(slots);
  }),
);
// RÉSERVATION : on vérifie le service, les horaires, les pauses et tous les conflits.
function book(req, publicBooking) {
  const b = req.body,
    s = settings(),
    service = one("services", b.serviceId);
  if (!service?.enabled) throw Error("Sélectionnez une prestation valide.");
  const duration = publicBooking
    ? service.duration
    : Number(b.duration || service.duration);
  if (b.date < localDate(s.timezone))
    throw Error("Impossible de réserver un rendez-vous dans le passé.");
  if (
    publicBooking &&
    b.date === localDate(s.timezone) &&
    b.time <= localTime(s.timezone)
  )
    throw Error("Cet horaire est déjà passé.");
  return transaction(() => {
    validateSlot(b.date, b.time, duration, all("appointments"), s);
    let p;
    if (!publicBooking && b.patientId) p = one("patients", b.patientId);
    if (!p) {
      p = { ...patientInput(b), id: id(), createdAt: new Date().toISOString() };
      put("patients", p);
    }
    const a = {
      id: id(),
      number: "PLS-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      accessToken: crypto.randomBytes(24).toString("hex"),
      patientId: p.id,
      doctorId: "clinic",
      serviceId: service.id,
      date: b.date,
      scheduledStart: b.time,
      scheduledEnd: clock(minutes(b.time) + duration),
      estimatedStart: b.time,
      estimatedEnd: clock(minutes(b.time) + duration),
      actualStart: null,
      actualEnd: null,
      duration,
      status: "CONFIRMED",
      priority: publicBooking
        ? "Normal"
        : ["Normal", "Priority", "Urgent"].includes(b.priority)
          ? b.priority
          : "Normal",
      reason: clean(b.reason),
      notes: publicBooking ? "" : clean(b.notes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    put("appointments", a);
    notify(
      a,
      "Votre rendez-vous est confirmé pour le " + a.date + " à " + a.scheduledStart + ".",
    );
    audit(req, "Rendez-vous réservé", null, {
      id: a.id,
      time: a.scheduledStart,
    });
    return a;
  });
}
app.post(
  "/api/book",
  limit,
  route((req, res) => {
    const a = book(req, true);
    res.json({ id: a.id, token: a.accessToken, number: a.number });
  }),
);
// Un patient doit utiliser son lien privé, même si son e-mail correspond à un compte.
function canView(req, a) {
  return (
    a &&
    (req.query.token === a.accessToken ||
      (req.user && ["ADMIN", "DOCTOR", "SECRETARIAT"].includes(req.user.role)))
  );
}
app.get(
  "/api/appointment/:id",
  route((req, res) => {
    const a = one("appointments", req.params.id);
    if (!canView(req, a))
      return res.status(404).json({
        error: "Rendez-vous introuvable. Utilisez votre lien privé de confirmation.",
      });
    const { accessToken, notes, ...safe } = a;
    res.json({
      ...safe,
      patient: one("patients", a.patientId),
      doctor: settings(),
      service: one("services", a.serviceId),
      notifications: all("notifications").filter((n) => n.appointmentId === a.id),
    });
  }),
);
app.post(
  "/api/appointment/:id/cancel",
  route((req, res) => {
    const a = one("appointments", req.params.id);
    if (!canView(req, a))
      return res.status(404).json({ error: "Rendez-vous introuvable." });
    if (inactive.includes(a.status) || a.status === "IN_CONSULTATION")
      throw Error("Ce rendez-vous ne peut plus être annulé.");
    transaction(() => {
      const before = { ...a };
      a.status = "CANCELLED";
      a.updatedAt = new Date().toISOString();
      put("appointments", a);
      notify(a, "Votre rendez-vous a été annulé.");
      audit(req, "Rendez-vous annulé", before, a);
    });
    res.json({ ok: true });
  }),
);
app.get("/api/events", (req, res) => {
  if (!req.user && !all("appointments").some((a) => a.accessToken === req.query.token))
    return res.sendStatus(401);
  res.set({
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });
  res.flushHeaders();
  res.write(": connected\n\n");
  const c = { res };
  clients.add(c);
  const heartbeat = setInterval(() => {
    if (req.user && !userFor(req)) {
      res.end();
      return;
    }
    res.write(": heartbeat\n\n");
  }, 20000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(c);
  });
});
app.get("/api/dashboard", requireAuth, staff, (req, res) =>
  res.json({
    appointments: all("appointments").map(({ accessToken, ...a }) => ({
      ...a,
      patient: one("patients", a.patientId),
      service: one("services", a.serviceId),
    })),
    patients: all("patients"),
    settings: settings(),
    services: all("services"),
    notifications: all("notifications"),
    audit: all("audit").reverse(),
    today: localDate(settings().timezone),
    user: req.user,
  }),
);
app.use("/api/settings", (req, res, next) => {
  if (
    req.method === "PUT" &&
    req.body.timezone &&
    req.body.timezone !== settings().timezone &&
    all("appointments").some(
      (a) => !inactive.includes(a.status) && a.date >= localDate(settings().timezone),
    )
  )
    return res.status(400).json({
      error:
        "Traitez les rendez-vous à venir avant de modifier le fuseau horaire du cabinet.",
    });
  next();
});
app.post(
  "/api/appointments",
  requireAuth,
  staff,
  route((req, res) => {
    const a = book(req, false);
    res.json({ id: a.id });
  }),
);
app.patch(
  "/api/appointments/:id",
  requireAuth,
  staff,
  route((req, res) => {
    transaction(() => {
      const a = one("appointments", req.params.id);
      if (!a) throw Error("Rendez-vous introuvable.");
      const before = { ...a },
        b = req.body;
      if (b.status) {
        if (
          ![
            "SCHEDULED",
            "CONFIRMED",
            "ARRIVED",
            "WAITING",
            "IN_CONSULTATION",
            "COMPLETED",
            "CANCELLED",
            "NO_SHOW",
            "RESCHEDULED",
          ].includes(b.status)
        )
          throw Error("Statut invalide.");
        if (inactive.includes(a.status))
          throw Error(
            "Ce rendez-vous est archivé. Créez une nouvelle réservation pour conserver son historique.",
          );
        if (b.status === "IN_CONSULTATION") {
          if (a.date !== localDate(settings().timezone))
            throw Error("La consultation ne peut commencer que le jour du rendez-vous.");
          if (
            all("appointments").some(
              (x) => x.status === "IN_CONSULTATION" && x.id !== a.id,
            )
          )
            throw Error("Terminez d’abord la consultation en cours.");
          a.actualStart = new Date().toISOString();
        }
        if (b.status === "COMPLETED") {
          if (a.status !== "IN_CONSULTATION")
            throw Error("Commencez cette consultation avant de la terminer.");
          a.actualEnd = new Date().toISOString();
        }
        a.status = b.status;
      }
      if (b.time || b.date || b.duration) {
        if (inactive.includes(before.status) || before.status === "IN_CONSULTATION")
          throw Error("Seuls les rendez-vous à venir peuvent être reprogrammés.");
        validateSlot(
          b.date || a.date,
          b.time || a.scheduledStart,
          Number(b.duration || a.duration),
          all("appointments"),
          settings(),
          a.id,
        );
        a.date = b.date || a.date;
        a.scheduledStart = b.time || a.scheduledStart;
        a.estimatedStart = a.scheduledStart;
        a.duration = Number(b.duration || a.duration);
        a.scheduledEnd = clock(minutes(a.scheduledStart) + a.duration);
        a.estimatedEnd = a.scheduledEnd;
        a.status = "RESCHEDULED";
      }
      if (b.notes !== undefined) a.notes = clean(b.notes, 2000);
      if (b.priority) {
        if (!["Normal", "Priority", "Urgent"].includes(b.priority))
          throw Error("Priorité invalide.");
        a.priority = b.priority;
      }
      a.updatedAt = new Date().toISOString();
      put("appointments", a);
      audit(req, "Rendez-vous mis à jour", before, a);
      notify(
        a,
        b.status === "IN_CONSULTATION"
          ? "Le médecin est prêt à vous recevoir."
          : `Votre rendez-vous a été mis à jour : ${statusLabel(a.status).toLowerCase()}. Horaire estimé : ${a.estimatedStart}.`,
      );
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/queue",
  requireAuth,
  staff,
  route((req, res) => {
    const { date, mode, delay } = req.body;
    transaction(() => {
      const appts = all("appointments"),
        s = settings();
      let start = req.body.time || localTime(s.timezone);
      if (mode === "delay") {
        if (!Number.isInteger(Number(delay)) || Number(delay) < 1 || Number(delay) > 180)
          throw Error("Saisissez un retard compris entre 1 et 180 minutes.");
        const next = appts
          .filter(
            (a) =>
              a.date === date &&
              !inactive.includes(a.status) &&
              a.status !== "IN_CONSULTATION",
          )
          .sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart))[0];
        if (!next) throw Error("Aucun patient à venir.");
        start = clock(minutes(next.estimatedStart) + Number(delay));
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start))
        throw Error("Saisissez une heure de début valide pour la file.");
      const changes = shiftQueue(appts, date, start, s, mode === "next");
      if (!changes.length) throw Error("Aucun patient à venir à déplacer.");
      for (const c of changes) {
        const a = one("appointments", c.id),
          before = { ...a };
        a.estimatedStart = c.estimatedStart;
        a.estimatedEnd = clock(minutes(a.estimatedStart) + a.duration);
        a.updatedAt = new Date().toISOString();
        put("appointments", a);
        notify(a, `Votre nouvel horaire estimé de rendez-vous est ${a.estimatedStart}.`);
        audit(req, "Horaire de la file modifié", before, a);
      }
    });
    res.json({ ok: true });
  }),
);
app.put(
  "/api/settings",
  requireAuth,
  staff,
  route((req, res) => {
    const b = req.body,
      s = settings();
    if (!Number.isInteger(Number(b.duration)) || b.duration < 5 || b.duration > 240)
      throw Error("La durée par défaut doit être comprise entre 5 et 240 minutes.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw Error("Fuseau horaire invalide.");
    }
    if (!Array.isArray(b.days) || b.days.length !== 7)
      throw Error("Renseignez les sept jours de la semaine.");
    for (const d of b.days) {
      if (!d.enabled) continue;
      for (const t of [d.start, d.end, d.breakStart, d.breakEnd].filter(Boolean))
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
          throw Error("Horaire de travail invalide.");
      if (
        d.start >= d.end ||
        Boolean(d.breakStart) !== Boolean(d.breakEnd) ||
        (d.breakStart &&
          (d.breakStart >= d.breakEnd || d.breakStart < d.start || d.breakEnd > d.end))
      )
        throw Error("Vérifiez les horaires d’ouverture et les pauses.");
    }
    const next = {
      ...s,
      name: clean(b.name, 100) || s.name,
      specialty: clean(b.specialty, 100) || s.specialty,
      address: clean(b.address) || s.address,
      phone: clean(b.phone, 30) || s.phone,
      email: clean(b.email, 160) || s.email,
      duration: Number(b.duration),
      timezone: b.timezone,
      days: b.days,
      holidays: Array.isArray(b.holidays) ? b.holidays : [],
      reminders: Array.isArray(b.reminders)
        ? b.reminders.filter((n) => Number.isFinite(n) && n > 0 && n <= 168)
        : s.reminders,
    };
    for (const a of all("appointments").filter(
      (a) => !inactive.includes(a.status) && a.date >= localDate(s.timezone),
    ))
      validateSlot(a.date, a.scheduledStart, a.duration, [], next);
    transaction(() => {
      put("settings", next);
      audit(req, "Paramètres du cabinet modifiés", s, next);
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/services",
  requireAuth,
  staff,
  route((req, res) => {
    const b = req.body;
    if (
      !clean(b.name) ||
      !Number.isInteger(Number(b.duration)) ||
      b.duration < 5 ||
      b.duration > 240 ||
      !Number.isFinite(Number(b.price || 0)) ||
      Number(b.price) < 0
    )
      throw Error(
        "Saisissez un nom de prestation, une durée valide et un tarif positif ou nul.",
      );
    transaction(() => {
      const s = {
        id: b.id || id(),
        name: clean(b.name, 100),
        description: clean(b.description),
        duration: Number(b.duration),
        price: Number(b.price || 0),
        enabled: b.enabled !== false,
      };
      put("services", s);
      audit(req, "Prestation enregistrée", null, s);
    });
    res.json({ ok: true });
  }),
);
app.post("/api/notifications/read", requireAuth, staff, (req, res) => {
  transaction(() =>
    all("notifications").forEach((n) => put("notifications", { ...n, read: true })),
  );
  res.json({ ok: true });
});
app.get("/api/users", requireAuth, admin, (req, res) => {
  const r = db.exec("SELECT id,name,email,role FROM users");
  res.json(
    r.length
      ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((k, i) => [k, v[i]])))
      : [],
  );
});
app.post(
  "/api/users",
  requireAuth,
  admin,
  route((req, res) => {
    const b = req.body;
    if (
      !["DOCTOR", "SECRETARIAT", "ADMIN"].includes(b.role) ||
      !/^\S+@\S+\.\S+$/.test(b.email || "") ||
      String(b.password || "").length < 12 ||
      !clean(b.name)
    )
      throw Error(
        "Saisissez un nom, un e-mail valide, un rôle et un mot de passe d’au moins 12 caractères.",
      );
    const salt = crypto.randomBytes(16).toString("hex");
    transaction(() => {
      db.run("INSERT INTO users VALUES (?,?,?,?,?,?)", [
        id(),
        clean(b.email).toLowerCase(),
        clean(b.name),
        b.role,
        salt,
        hash(b.password, salt),
      ]);
      audit(req, "Compte professionnel créé", null, {
        email: b.email,
        role: b.role,
      });
    });
    res.json({ ok: true });
  }),
);
// NOTIFICATIONS : les messages du suivi sont immédiats. Les notes médicales ne sont jamais envoyées.
// Les e-mails sont confiés à un adaptateur configurable ; les rappels utilisent les dates UTC.
let delivering = false;
setInterval(async () => {
  if (delivering) return;
  delivering = true;
  try {
    const s = settings();
    let changed = false;
    for (const a of all("appointments").filter((a) => !inactive.includes(a.status))) {
      const at =
        a.scheduledStartAt ||
        zonedTimestamp(a.date, a.scheduledStart, a.timezone || s.timezone);
      const hours = (Date.parse(at) - Date.now()) / 3600000;
      for (const h of s.reminders) {
        if (
          hours > 0 &&
          hours <= h &&
          !all("notifications").some(
            (n) => n.appointmentId === a.id && n.reminder === h && n.scheduledFor === at,
          )
        ) {
          put("notifications", {
            id: id(),
            appointmentId: a.id,
            patientId: a.patientId,
            message: `Rappel : votre rendez-vous est prévu le ${a.date} à ${a.scheduledStart} (${a.timezone || s.timezone}).`,
            createdAt: new Date().toISOString(),
            read: false,
            reminder: h,
            scheduledFor: at,
            channel: "in-app",
            emailStatus: process.env.EMAIL_WEBHOOK ? "pending" : "not-configured",
          });
          changed = true;
        }
      }
    }
    if (changed) {
      save();
      emit();
    }
    if (process.env.EMAIL_WEBHOOK) {
      for (const n of all("notifications").filter((n) => n.emailStatus === "pending")) {
        try {
          const response = await fetch(process.env.EMAIL_WEBHOOK, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(process.env.EMAIL_WEBHOOK_TOKEN
                ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({
              id: n.id,
              to: one("patients", n.patientId)?.email,
              subject: "Votre rendez-vous Pulse",
              text: n.message,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (response.ok) {
            put("notifications", { ...n, emailStatus: "sent" });
            save();
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("Échec du traitement des rappels :", e.message);
  } finally {
    delivering = false;
  }
}, 60000).unref();
app.use("/api", (err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({
    error: err.message.includes("UNIQUE")
      ? "Cet enregistrement existe déjà."
      : err.message,
  });
});
app.use("/api", (req, res) => res.status(404).json({ error: "Ressource introuvable." }));
// En ligne, on sert les fichiers compilés ; en développement, Vite actualise l’interface.
if (process.env.NODE_ENV === "production") {
  const dist = fileURLToPath(new URL("./dist/", import.meta.url));
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(dist + "index.html"));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
httpServer.listen(port, "0.0.0.0", () =>
  console.log(`Pulse est disponible sur http://localhost:${port}`),
);
