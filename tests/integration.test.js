// API-level tests: start an isolated server and verify security, persistence, and workflows.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import initSqlJs from "sql.js";
import crypto from "node:crypto";

test(
  "API security, persistence, scheduling and live updates",
  { timeout: 60000 },
  async (t) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tests-"));
    const port = 19387,
      base = `http://127.0.0.1:${port}/api`;
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../server.js", import.meta.url))],
      {
        cwd,
        env: {
          ...process.env,
          PORT: String(port),
          NODE_ENV: "production",
          ADMIN_EMAIL: "test@pulse.local",
          ADMIN_PASSWORD: "A-long-test-password-2026",
          CODESPACE_NAME: "cabinet-test",
          GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let logs = "";
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    t.after(async () => {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    });
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(base + "/public");
        break;
      } catch {
        if (i === 99) throw Error("Server did not start: " + logs);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const request = async (url, method = "GET", body, cookie) => {
      const r = await fetch(base + url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    };
    let cookie, service, date, appointment;
    await t.test("private dashboard rejects signed-out visitors", async () => {
      assert.equal((await request("/dashboard")).status, 401);
      assert.equal((await request("/public")).status, 200);
    });
    await t.test(
      "Le cabinet est configuré en français, en Algérie et ouvert les sept jours",
      async () => {
        const { data } = await request("/public");
        assert.equal(data.doctor.timezone, "Africa/Algiers");
        assert.equal(data.doctor.currency, "DZD");
        assert.equal(data.doctor.locale, "fr-DZ");
        assert(data.doctor.phone.startsWith("+213"));
        assert.equal(data.doctor.days.length, 7);
        assert(
          data.doctor.days.every(
            (day) => day.enabled && day.start === "08:00" && day.end === "17:00",
          ),
        );
        assert(
          data.services.some(
            (service) =>
              service.name === "Première consultation" && service.price === 5000,
          ),
        );
      },
    );
    await t.test(
      "Les origines Codespaces autorisées fonctionnent et les autres sont rejetées",
      async () => {
        const allowed = `https://cabinet-test-${port}.app.github.dev`;
        for (const origin of [allowed, `http://127.0.0.1:${port}`]) {
          const response = await fetch(base + "/logout", {
            method: "POST",
            headers: { Origin: origin },
          });
          assert.equal(response.status, 200);
        }
        for (const origin of [
          "null",
          "not a URL",
          "https://other-3000.app.github.dev",
          "javascript:alert(1)",
          `${allowed}/path`,
        ]) {
          const response = await fetch(base + "/logout", {
            method: "POST",
            headers: { Origin: origin },
          });
          assert.equal(response.status, 403);
          assert.match((await response.json()).error, /n’est pas autorisée/);
        }
      },
    );
    await t.test("staff login uses secure session attributes", async () => {
      const r = await fetch(base + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@pulse.local",
          password: "A-long-test-password-2026",
        }),
      });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("set-cookie"), /HttpOnly/);
      assert.match(r.headers.get("set-cookie"), /SameSite=Strict/);
      cookie = r.headers.get("set-cookie").split(";")[0];
      const d = await request("/dashboard", "GET", null, cookie);
      assert.equal(d.status, 200);
      assert.equal(d.data.user.role, "ADMIN");
      service = d.data.services[0];
      date = d.data.today;
      const future = new Date(date + "T12:00:00Z");
      future.setUTCDate(future.getUTCDate() + 2);
      date = future.toISOString().slice(0, 10);
      if (future.getUTCDay() === 0) {
        future.setUTCDate(future.getUTCDate() + 1);
        date = future.toISOString().slice(0, 10);
      }
    });
    const body = () => ({
      firstName: "Test",
      lastName: "Patient",
      email: "patient@example.com",
      phone: "+213555123456",
      date,
      time: "08:00",
      serviceId: service.id,
    });
    await t.test("two concurrent bookings cannot reserve the same slot", async () => {
      const results = await Promise.all([
        request("/book", "POST", body()),
        request("/book", "POST", body()),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      appointment = results.find((r) => r.status === 200).data;
      assert.match(results.find((r) => r.status === 400).data.error, /déjà occupé/);
    });
    await t.test("private appointment tokens enforce patient isolation", async () => {
      assert.equal((await request("/appointment/" + appointment.id)).status, 404);
      assert.equal(
        (await request("/appointment/" + appointment.id + "?token=wrong")).status,
        404,
      );
      const r = await request(
        "/appointment/" + appointment.id + "?token=" + appointment.token,
      );
      assert.equal(r.status, 200);
      assert.equal(r.data.accessToken, undefined);
      assert.equal(r.data.notes, undefined);
      assert.equal(r.data.patient.firstName, "Test");
    });
    await t.test(
      "WebSocket connections require authentication and receive live invalidations",
      async () => {
        const unauthorized = io(`http://127.0.0.1:${port}`, {
          transports: ["websocket"],
          reconnection: false,
        });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error("Unauthenticated socket did not fail")),
            5000,
          );
          unauthorized.on("connect_error", () => {
            clearTimeout(timeout);
            unauthorized.disconnect();
            resolve();
          });
          unauthorized.on("connect", () => {
            clearTimeout(timeout);
            unauthorized.disconnect();
            reject(Error("Unauthorized connection accepted"));
          });
        });
        const socket = io(`http://127.0.0.1:${port}`, {
          auth: { token: appointment.token },
          transports: ["websocket"],
          reconnection: false,
        });
        try {
          await new Promise((resolve, reject) => {
            socket.on("connect", resolve);
            socket.on("connect_error", reject);
          });
          const update = new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(Error("WebSocket update missing")),
              5000,
            );
            socket.once("update", (data) => {
              clearTimeout(timer);
              resolve(data);
            });
          });
          await request(
            "/appointments/" + appointment.id,
            "PATCH",
            { notes: "Administrative test note" },
            cookie,
          );
          assert.deepEqual(await update, {});
        } finally {
          socket.disconnect();
        }
      },
    );
    await t.test(
      "patient role cannot access staff information or create staff accounts",
      async () => {
        assert.equal(
          (
            await request("/register", "POST", {
              name: "Test patient",
              email: "account@example.com",
              password: "Patient-password-123",
              role: "ADMIN",
            })
          ).status,
          200,
        );
        const p = await request("/login", "POST", {
          email: "account@example.com",
          password: "Patient-password-123",
        });
        assert.equal(p.data.user.role, "PATIENT");
        assert.equal((await request("/dashboard", "GET", null, p.cookie)).status, 403);
        assert.equal(
          (await request("/users", "POST", { role: "ADMIN" }, p.cookie)).status,
          403,
        );
        assert.equal(
          (await request("/appointment/" + appointment.id, "GET", null, p.cookie)).status,
          404,
        );
      },
    );
    await t.test(
      "registering an unverified matching email cannot claim another booking",
      async () => {
        await request("/register", "POST", {
          name: "Unverified account",
          email: "patient@example.com",
          password: "Unverified-password-123",
        });
        const p = await request("/login", "POST", {
          email: "patient@example.com",
          password: "Unverified-password-123",
        });
        assert.equal(
          (await request("/appointment/" + appointment.id, "GET", null, p.cookie)).status,
          404,
        );
        assert.equal(
          (
            await request(
              "/appointment/" + appointment.id + "?token=" + appointment.token,
              "GET",
              null,
              p.cookie,
            )
          ).status,
          200,
        );
      },
    );
    await t.test("breaks and invalid durations are rejected server-side", async () => {
      assert.equal(
        (await request("/appointments", "POST", { ...body(), time: "12:00" }, cookie))
          .status,
        400,
      );
      assert.equal(
        (
          await request(
            "/appointments",
            "POST",
            { ...body(), time: "15:00", duration: 300 },
            cookie,
          )
        ).status,
        400,
      );
    });
    await t.test(
      "live events fire on appointment updates without broadcasting patient data",
      async () => {
        const controller = new AbortController();
        const response = await fetch(base + "/events?token=" + appointment.token, {
          signal: controller.signal,
        });
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        await reader.read();
        assert.equal(
          (
            await request(
              "/appointments/" + appointment.id,
              "PATCH",
              { status: "WAITING" },
              cookie,
            )
          ).status,
          200,
        );
        const event = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(Error("No live update received")), 5000),
          ),
        ]);
        const text = new TextDecoder().decode(event.value);
        assert.match(text, /event: update/);
        assert(!text.includes("Patient"));
        controller.abort();
      },
    );
    await t.test("rescheduling validates conflicts and updates estimates", async () => {
      const r = await request(
        "/appointments/" + appointment.id,
        "PATCH",
        { time: "09:00" },
        cookie,
      );
      assert.equal(r.status, 200);
      const a = await request(
        "/appointment/" + appointment.id + "?token=" + appointment.token,
      );
      assert.equal(a.data.scheduledStart, "09:00");
      assert.equal(a.data.estimatedStart, "09:00");
      assert.equal(a.data.status, "RESCHEDULED");
    });
    await t.test(
      "queue moves preserve original bookings and write notifications",
      async () => {
        assert.equal(
          (await request("/queue", "POST", { date, mode: "next", time: "08:35" }, cookie))
            .status,
          200,
        );
        const a = await request(
          "/appointment/" + appointment.id + "?token=" + appointment.token,
        );
        assert.equal(a.data.scheduledStart, "09:00");
        assert.equal(a.data.estimatedStart, "08:35");
        assert(a.data.notifications.some((n) => n.message.includes("08:35")));
      },
    );
    await t.test("no-show retains appointment history and audit trail", async () => {
      assert.equal(
        (
          await request(
            "/appointments/" + appointment.id,
            "PATCH",
            { status: "NO_SHOW" },
            cookie,
          )
        ).status,
        200,
      );
      const d = await request("/dashboard", "GET", null, cookie);
      assert.equal(d.data.appointments.length, 1);
      assert.equal(d.data.appointments[0].status, "NO_SHOW");
      assert(d.data.audit.length >= 4);
      assert(fs.statSync(path.join(cwd, "data", "clinic.sqlite")).size > 0);
    });
    await t.test(
      "public cancellation releases the slot and preserves history",
      async () => {
        const booked = await request("/book", "POST", body());
        assert.equal(booked.status, 200);
        assert.equal(
          (
            await request(
              "/appointment/" + booked.data.id + "/cancel?token=" + booked.data.token,
              "POST",
            )
          ).status,
          200,
        );
        const d = await request("/dashboard", "GET", null, cookie);
        assert.equal(d.data.appointments.length, 2);
        assert.equal(
          d.data.appointments.find((a) => a.id === booked.data.id).status,
          "CANCELLED",
        );
      },
    );
    await t.test(
      "cross-origin writes are blocked and logout revokes sessions",
      async () => {
        const bad = await fetch(base + "/appointments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: "https://untrusted.example",
          },
          body: JSON.stringify(body()),
        });
        assert.equal(bad.status, 403);
        assert.equal((await request("/logout", "POST", {}, cookie)).status, 200);
        assert.equal((await request("/dashboard", "GET", null, cookie)).status, 401);
      },
    );
  },
);

// Une ancienne base n’est jamais remplacée par une base de démonstration.
test(
  "La migration française conserve les patients, les rendez-vous et les comptes",
  { timeout: 30000 },
  async (t) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-migration-"));
    fs.mkdirSync(path.join(cwd, "data"));
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(
      "CREATE TABLE records (kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id)); CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,salt TEXT,hash TEXT)",
    );
    const insert = (kind, value) =>
      db.run("INSERT INTO records VALUES (?,?,?)", [
        kind,
        value.id,
        JSON.stringify(value),
      ]);
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    insert("settings", {
      id: "clinic",
      name: "Dr. Ahmed Benali",
      specialty: "Cardiologist",
      timezone: "Africa/Lagos",
      duration: 60,
      address: "24 Victoria Island, Lagos, Nigeria",
      phone: "+234 800 123 4567",
      email: "hello@pulseclinic.example",
      days: Array.from({ length: 7 }, (_, day) => ({
        enabled: day !== 0,
        start: "08:00",
        end: day === 6 ? "14:00" : "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      })),
      holidays: [],
      reminders: [24, 2],
    });
    insert("services", {
      id: "old-service",
      name: "Initial consultation",
      description: "Old example",
      duration: 60,
      price: 150,
      enabled: true,
    });
    insert("services", {
      id: "custom-service",
      name: "Prestation personnalisée",
      description: "Ne pas modifier",
      duration: 45,
      price: 4500,
      enabled: true,
    });
    insert("patients", {
      id: "old-patient",
      firstName: "Patient",
      lastName: "Conservé",
      phone: "+213555123456",
      email: "preserve@example.com",
    });
    insert("appointments", {
      id: "old-appointment",
      patientId: "old-patient",
      serviceId: "old-service",
      doctorId: "clinic",
      number: "PLS-TEST",
      accessToken: "private-test-token",
      date,
      scheduledStart: "08:00",
      estimatedStart: "08:00",
      duration: 60,
      status: "CONFIRMED",
      notes: "Note à conserver",
    });
    insert("notifications", {
      id: "old-message",
      appointmentId: "old-appointment",
      patientId: "old-patient",
      message: `Your appointment is confirmed for ${date} at 08:00.`,
      createdAt: new Date().toISOString(),
    });
    insert("audit", {
      id: "old-audit",
      action: "Appointment booked",
      actor: "Practice administrator",
      at: new Date().toISOString(),
      before: null,
      after: { id: "old-appointment" },
    });
    const salt = "migration-fixture-salt";
    const password = "Password-before-migration-123";
    db.run("INSERT INTO users VALUES (?,?,?,?,?,?)", [
      "old-admin",
      "old-admin@example.com",
      "Practice administrator",
      "ADMIN",
      salt,
      crypto.scryptSync(password, salt, 64).toString("hex"),
    ]);
    fs.writeFileSync(path.join(cwd, "data", "clinic.sqlite"), Buffer.from(db.export()));
    db.close();
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../server.js", import.meta.url))],
      {
        cwd,
        env: { ...process.env, NODE_ENV: "production", PORT: "19389" },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    t.after(async () => {
      const ended = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await ended;
    });
    const base = "http://127.0.0.1:19389/api";
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await fetch(base + "/public");
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const publicData = await (await fetch(base + "/public")).json();
    assert.equal(publicData.doctor.timezone, "Africa/Algiers");
    assert(publicData.doctor.days.every((day) => day.enabled && day.end === "17:00"));
    assert.equal(
      publicData.services.find((service) => service.id === "old-service").price,
      5000,
    );
    assert.equal(
      publicData.services.find((service) => service.id === "custom-service").price,
      4500,
    );
    const login = await fetch(base + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "old-admin@example.com", password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const dashboard = await (
      await fetch(base + "/dashboard", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(dashboard.patients[0].lastName, "Conservé");
    assert.equal(dashboard.appointments[0].id, "old-appointment");
    assert.equal(dashboard.appointments[0].notes, "Note à conserver");
    assert.equal(dashboard.audit[0].action, "Rendez-vous réservé");
    assert(
      dashboard.notifications[0].message.startsWith("Votre rendez-vous est confirmé"),
    );
    assert(fs.existsSync(path.join(cwd, "data", "clinic.before-algeria.sqlite")));
    const oldDb = new SQL.Database(
      fs.readFileSync(path.join(cwd, "data", "clinic.before-algeria.sqlite")),
    );
    const oldSettings = JSON.parse(
      oldDb.exec("SELECT data FROM records WHERE kind='settings'")[0].values[0][0],
    );
    assert.equal(oldSettings.timezone, "Africa/Lagos");
    oldDb.close();
  },
);
