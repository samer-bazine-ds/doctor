// Vérifications automatiques : utilisez npm test pour vérifier les règles sans ouvrir le navigateur.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSlot,
  getAvailableSlots,
  shiftQueue,
  localDate,
  localTime,
  zonedTimestamp,
  googleCalendarUrl,
  calendarFile,
  formatDinars,
  statusLabel,
} from "../scheduling.js";

// Shared opening hours used by the pure scheduling tests below.
const settings = {
  days: Array.from({ length: 7 }, () => ({
    enabled: true,
    start: "08:00",
    end: "17:00",
    breakStart: "12:00",
    breakEnd: "13:00",
  })),
  holidays: [],
};
const date = "2026-09-14";

// Calendar exports must use UTC while retaining the clinic's local timezone metadata.
test("L’export Google Agenda utilise l’heure d’Alger et ne transmet aucune donnée privée", () => {
  const doctor = {
    name: "Dr Ahmed Benali",
    address: "Alger, Algérie",
    timezone: "Africa/Algiers",
  };
  const appointment = {
    id: "test-calendar",
    date,
    scheduledStart: "08:00",
    duration: 60,
    accessToken: "secret-prive",
    reason: "ne pas transmettre",
    patient: { email: "patient@example.com" },
  };
  const url = new URL(googleCalendarUrl(appointment, doctor));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20260914T070000Z/20260914T080000Z");
  assert.equal(url.searchParams.get("ctz"), "Africa/Algiers");
  assert.equal(url.searchParams.get("location"), "Alger, Algérie");
  assert.equal(url.searchParams.get("text"), "Rendez-vous avec Dr Ahmed Benali");
  for (const secret of ["secret-prive", "ne pas transmettre", "patient@example.com"])
    assert(!decodeURIComponent(url.href).includes(secret));
  const file = calendarFile(appointment, doctor);
  assert(file.includes("DTSTART:20260914T070000Z\r\n"));
  assert(file.includes("DTEND:20260914T080000Z\r\n"));
  assert(file.includes("LOCATION:Alger\\, Algérie"));
  assert(!file.includes(appointment.reason));
});
test("Les tarifs et les statuts sont affichés en français", () => {
  assert.equal(formatDinars(5000).replace(/\s/g, ""), "5000DA");
  assert.equal(formatDinars(0).replace(/\s/g, ""), "0DA");
  assert.equal(statusLabel("NO_SHOW"), "Absent");
  assert.equal(statusLabel("CONFIRMED"), "Confirmé");
  assert.equal(statusLabel("Priority"), "Prioritaire");
});
test("scheduled clinic times are persisted as UTC timestamps", () => {
  assert.equal(
    zonedTimestamp("2026-09-14", "08:00", "Africa/Lagos"),
    "2026-09-14T07:00:00.000Z",
  );
  assert.equal(
    zonedTimestamp("2026-07-01", "08:00", "America/New_York"),
    "2026-07-01T12:00:00.000Z",
  );
  assert.equal(
    zonedTimestamp("2026-01-01", "08:00", "America/New_York"),
    "2026-01-01T13:00:00.000Z",
  );
});
test("nonexistent daylight-saving times and invalid calendar dates are rejected", () => {
  assert.throws(
    () => zonedTimestamp("2026-03-08", "02:30", "America/New_York"),
    /n’existe pas/,
  );
  assert.throws(
    () => validateSlot("2026-02-30", "08:00", 60, [], settings),
    /date valide/,
  );
});
const appointment = (name, time, status = "CONFIRMED", duration = 60) => ({
  id: name,
  date,
  scheduledStart: time,
  estimatedStart: time,
  duration,
  status,
});
test("booking accepts a valid free slot", () =>
  assert.equal(validateSlot(date, "08:00", 60, [], settings), true));
test("double booking and partial overlaps are rejected", () => {
  for (const t of ["08:00", "08:15", "08:45"])
    assert.throws(
      () => validateSlot(date, t, 60, [appointment("a", "08:00")], settings),
      /déjà occupé/,
    );
});
test("adjacent appointments do not conflict", () =>
  assert.equal(
    validateSlot(date, "09:00", 60, [appointment("a", "08:00")], settings),
    true,
  ));
test("cancellation and no-show release slots without deleting history", () => {
  for (const status of ["CANCELLED", "NO_SHOW"]) {
    const list = [appointment("a", "08:00", status)];
    assert.equal(validateSlot(date, "08:00", 60, list, settings), true);
    assert.equal(list.length, 1);
  }
});
test("completed appointments retain occupied original time", () =>
  assert.throws(
    () =>
      validateSlot(date, "08:00", 60, [appointment("a", "08:00", "COMPLETED")], settings),
    /déjà occupé/,
  ));
test("rescheduling ignores itself but checks other appointments", () => {
  const list = [appointment("a", "08:00"), appointment("b", "10:00")];
  assert.equal(validateSlot(date, "08:30", 60, list, settings, "a"), true);
  assert.throws(
    () => validateSlot(date, "09:30", 60, list, settings, "a"),
    /déjà occupé/,
  );
});
test("breaks block any overlapping duration", () => {
  for (const [t, d] of [
    ["12:00", 60],
    ["11:30", 60],
    ["12:30", 30],
  ])
    assert.throws(() => validateSlot(date, t, d, [], settings), /pause/);
  assert.equal(validateSlot(date, "11:00", 60, [], settings), true);
});
test("holidays and closed days have no availability", () => {
  assert.deepEqual(
    getAvailableSlots(date, 60, [], { ...settings, holidays: [{ date }] }),
    [],
  );
  assert.deepEqual(
    getAvailableSlots(date, 60, [], {
      ...settings,
      days: settings.days.map((d) => ({ ...d, enabled: false })),
    }),
    [],
  );
});
test("variable durations are checked against closing hours", () => {
  assert.equal(validateSlot(date, "15:30", 90, [], settings), true);
  assert.throws(() => validateSlot(date, "16:00", 90, [], settings), /horaires/);
  for (const duration of [0, 1, 241, NaN, 30.5])
    assert.throws(() => validateSlot(date, "08:00", duration, [], settings));
});
test("available slots never contain an occupied or protected time", () => {
  const slots = getAvailableSlots(date, 60, [appointment("a", "09:00")], settings);
  assert(slots.includes("08:00"));
  assert(!slots.includes("08:15"));
  assert(!slots.includes("09:00"));
  assert(!slots.includes("11:15"));
  assert(!slots.includes("12:00"));
  assert(slots.includes("13:00"));
});
test("exact requested queue example preserves lunch and afternoon", () => {
  const list = [
    appointment("Ahmed", "08:00", "COMPLETED"),
    appointment("Yassine", "09:00"),
    appointment("Sara", "10:00"),
    appointment("Karim", "11:00"),
    appointment("Amine", "13:00"),
    appointment("Samir", "14:00"),
  ];
  assert.deepEqual(shiftQueue(list, date, "08:35", settings), [
    { id: "Yassine", estimatedStart: "08:35" },
    { id: "Sara", estimatedStart: "09:35" },
    { id: "Karim", estimatedStart: "10:35" },
    { id: "Amine", estimatedStart: "13:00" },
    { id: "Samir", estimatedStart: "14:00" },
  ]);
  assert.equal(list[1].scheduledStart, "09:00");
});
test("move next changes only the next patient", () =>
  assert.deepEqual(
    shiftQueue(
      [appointment("b", "09:00"), appointment("c", "10:00")],
      date,
      "08:35",
      settings,
      true,
    ),
    [{ id: "b", estimatedStart: "08:35" }],
  ));
test("move next refuses a collision with the following patient", () =>
  assert.throws(
    () =>
      shiftQueue(
        [appointment("b", "09:00"), appointment("c", "10:00")],
        date,
        "09:30",
        settings,
        true,
      ),
    /chevaucherait/,
  ));
test("no-shows are excluded from queue recalculation", () =>
  assert.deepEqual(
    shiftQueue(
      [appointment("b", "09:00", "NO_SHOW"), appointment("c", "10:00")],
      date,
      "09:00",
      settings,
    ),
    [{ id: "c", estimatedStart: "09:00" }],
  ));
test("delays shift estimates and preserve a break", () =>
  assert.deepEqual(
    shiftQueue(
      [appointment("b", "10:00"), appointment("c", "11:00")],
      date,
      "10:30",
      settings,
    ),
    [
      { id: "b", estimatedStart: "10:30" },
      { id: "c", estimatedStart: "13:00" },
    ],
  ));
test("queue overflow fails before modifying appointments", () => {
  const list = [appointment("b", "15:00"), appointment("c", "16:00")];
  assert.throws(() => shiftQueue(list, date, "15:30", settings), /fermeture/);
  assert.equal(list[0].estimatedStart, "15:00");
});
test("estimated-time occupancy is protected from new bookings", () => {
  const a = { ...appointment("a", "10:00"), estimatedStart: "09:00" };
  assert.throws(() => validateSlot(date, "09:00", 60, [a], settings), /déjà occupé/);
});
test("clinic time zone handles UTC day boundaries and DST", () => {
  const now = new Date("2026-01-01T23:30:00Z");
  assert.equal(localDate("Africa/Lagos", now), "2026-01-02");
  assert.equal(localTime("Africa/Lagos", now), "00:30");
  assert.equal(localTime("America/New_York", new Date("2026-07-01T12:00:00Z")), "08:00");
  assert.equal(localTime("America/New_York", new Date("2026-01-01T12:00:00Z")), "07:00");
});
