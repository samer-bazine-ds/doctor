/**
 * Règles du planning et exports d’agenda partagés par le serveur et l’interface.
 * Les identifiants techniques restent stables ; seuls les libellés sont traduits.
 */
export const statusLabels = {
  SCHEDULED: "Programmé",
  CONFIRMED: "Confirmé",
  ARRIVED: "Arrivé",
  WAITING: "En attente",
  IN_CONSULTATION: "En consultation",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
  NO_SHOW: "Absent",
  RESCHEDULED: "Reprogrammé",
  ADMIN: "Administrateur",
  DOCTOR: "Médecin",
  SECRETARIAT: "Secrétariat",
  PATIENT: "Patient",
  AVAILABLE: "Disponible",
  DISABLED: "Indisponible",
  Normal: "Normale",
  Priority: "Prioritaire",
  Urgent: "Urgente",
  pending: "En attente",
  sent: "Envoyé",
  "not-configured": "Non configuré",
};

export const statusLabel = (status) => statusLabels[status] || status || "—";

/** Affichage en dinars algériens, sans conversion depuis une autre devise. */
export function formatDinars(amount) {
  return (
    new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(
      Number(amount || 0),
    ) + " DA"
  );
}

export const inactive = ["COMPLETED", "CANCELLED", "NO_SHOW"];
export const minutes = (t) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
export const clock = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Validate the selected date against holidays and the weekly opening rules.
export function dayRule(date, settings) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Choisissez une date valide.");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw Error("Choisissez une date valide.");
  const day = parsed.getUTCDay();
  if (settings.holidays.some((h) => h.date === date))
    throw Error("Le cabinet est fermé à cette date.");
  const rule = settings.days[day];
  if (!rule?.enabled) throw Error("Le cabinet est fermé ce jour-là.");
  return rule;
}

// Reject invalid times, breaks, closed days, and overlaps with existing appointments.
export function validateSlot(date, time, duration, appointments, settings, exclude) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error("Choisissez une heure valide.");
  if (!Number.isInteger(duration) || duration < 5 || duration > 240)
    throw Error("La durée doit être comprise entre 5 et 240 minutes.");
  const r = dayRule(date, settings),
    start = minutes(time),
    end = start + duration;
  if (start < minutes(r.start) || end > minutes(r.end))
    throw Error("Ce rendez-vous est en dehors des horaires d’ouverture.");
  if (r.breakStart && start < minutes(r.breakEnd) && end > minutes(r.breakStart))
    throw Error("Ce rendez-vous chevauche une pause protégée.");
  if (
    appointments.some(
      (a) =>
        a.id !== exclude &&
        a.date === date &&
        !["CANCELLED", "NO_SHOW"].includes(a.status) &&
        ((start < minutes(a.scheduledStart) + a.duration &&
          end > minutes(a.scheduledStart)) ||
          (start < minutes(a.estimatedStart) + a.duration &&
            end > minutes(a.estimatedStart))),
    )
  )
    throw Error(
      "Ce créneau est déjà occupé par un autre rendez-vous. Choisissez un autre horaire.",
    );
  return true;
}

// Generate bookable times in 15-minute increments for the public booking calendar.
export function getAvailableSlots(date, duration, appointments, settings) {
  let rule;
  try {
    rule = dayRule(date, settings);
  } catch {
    return [];
  }
  const slots = [];
  for (let m = minutes(rule.start); m + duration <= minutes(rule.end); m += 15) {
    try {
      validateSlot(date, clock(m), duration, appointments, settings);
      slots.push(clock(m));
    } catch {}
  }
  return slots;
}

// Move estimated queue times while preserving the original booked appointment times.
export function shiftQueue(appointments, date, start, settings, onlyNext = false) {
  const rule = dayRule(date, settings);
  const queue = appointments
    .filter(
      (a) =>
        a.date === date && !inactive.includes(a.status) && a.status !== "IN_CONSULTATION",
    )
    .sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart));
  let cursor = Math.max(minutes(start), minutes(rule.start));
  const changes = [];
  for (const a of queue) {
    if (
      rule.breakStart &&
      cursor < minutes(rule.breakEnd) &&
      cursor + a.duration > minutes(rule.breakStart)
    )
      cursor = minutes(rule.breakEnd);
    if (cursor + a.duration > minutes(rule.end))
      throw Error(
        "La file dépasserait l’heure de fermeture. Reprogrammez d’abord un rendez-vous.",
      );
    const blockers = appointments.filter(
      (b) =>
        b.date === date &&
        b.id !== a.id &&
        (b.status === "IN_CONSULTATION" ||
          (onlyNext && queue.some((q) => q.id === b.id))),
    );
    if (
      blockers.some(
        (b) =>
          cursor < minutes(b.estimatedStart) + b.duration &&
          cursor + a.duration > minutes(b.estimatedStart),
      )
    )
      throw Error(
        "Ce déplacement chevaucherait une autre consultation. Décalez plutôt toute la file.",
      );
    changes.push({ id: a.id, estimatedStart: clock(cursor) });
    cursor += a.duration;
    if (onlyNext) break;
  }
  return changes;
}

// Convert the current instant into the clinic's local calendar date or clock time.
export function localDate(timezone = "Africa/Algiers", now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function localTime(timezone = "Africa/Algiers", now = new Date()) {
  return new Intl.DateTimeFormat("fr-DZ", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
export function zonedTimestamp(date, time, timezone) {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) throw Error("Date ou heure de rendez-vous invalide.");
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 5; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(candidate)).map((p) => [p.type, p.value]),
    );
    const observed = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`,
    );
    if (observed === target) return new Date(candidate).toISOString();
    candidate += target - observed;
  }
  throw Error(
    "Cette heure locale n’existe pas en raison d’un changement d’heure. Choisissez un autre horaire.",
  );
}

/** Les agendas reçoivent des dates UTC, même si le patient réserve en heure d’Alger. */
function calendarTimes(appointment, doctor) {
  const start =
    appointment.scheduledStartAt ||
    zonedTimestamp(
      appointment.date,
      appointment.scheduledStart,
      appointment.timezone || doctor.timezone || "Africa/Algiers",
    );
  const end =
    appointment.scheduledEndAt ||
    new Date(Date.parse(start) + appointment.duration * 60000).toISOString();
  const compact = (value) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  return { start: compact(start), end: compact(end), compact };
}

/**
 * Ouvre un événement prérempli : le patient choisit son compte et confirme chez Google.
 * Aucun jeton privé, motif médical, téléphone ou e-mail n’est transmis à Google.
 * Ce lien ne crée pas de synchronisation automatique entre les deux systèmes.
 */
export function googleCalendarUrl(appointment, doctor) {
  const { start, end } = calendarTimes(appointment, doctor);
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: `Rendez-vous avec ${doctor.name}`,
    dates: `${start}/${end}`,
    ctz: appointment.timezone || doctor.timezone || "Africa/Algiers",
    location: doctor.address,
    details:
      "Consultation au cabinet. Horaire réservé : consultez votre page de suivi privée pour connaître l’horaire estimé en direct. Les modifications ne sont pas synchronisées automatiquement avec cet agenda.",
  });
  return `https://calendar.google.com/calendar/render?${parameters}`;
}

/** Fichier standard .ics : compatible avec Google Agenda, Apple Agenda et Outlook. */
export function calendarFile(appointment, doctor) {
  const { start, end, compact } = calendarTimes(appointment, doctor);
  const escape = (value) =>
    String(value)
      .replaceAll("\\", "\\\\")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;")
      .replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pulse//Rendez-vous//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@pulse`,
    `DTSTAMP:${compact(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(`Rendez-vous avec ${doctor.name}`)}`,
    `LOCATION:${escape(doctor.address)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
