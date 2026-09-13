import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-browser-"));
const server = spawn(
  process.execPath,
  [fileURLToPath(new URL("../server.js", import.meta.url))],
  {
    cwd,
    env: {
      ...process.env,
      PORT: "19388",
      NODE_ENV: "production",
      ADMIN_EMAIL: "browser@pulse.local",
      ADMIN_PASSWORD: "Browser-test-password-2026",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch("http://localhost:19388/api/public");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:19388/dashboard");
  await page.getByRole("heading", { name: "Votre cabinet en un coup d’œil" }).waitFor();
  fs.mkdirSync("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  assert.equal(await page.locator("html").getAttribute("lang"), "fr-DZ");
  await page.getByRole("button", { name: "Espace professionnel", exact: true }).click();
  await page.getByLabel("Adresse e-mail").fill("browser@pulse.local");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("Browser-test-password-2026");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  // Chrome accepte les cookies sécurisés de production sur localhost pour ces tests.
  await page.getByRole("heading", { name: "Votre cabinet en un coup d’œil" }).waitFor();
  await page.getByRole("button", { name: "Ajouter un patient", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Prénom", { exact: true }).fill("Browser");
  await page.getByLabel("Nom", { exact: true }).fill("Patient");
  await page.getByLabel("Numéro de téléphone", { exact: true }).fill("+213555123456");
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("browser-patient@example.com");
  const pub = await (await fetch("http://localhost:19388/api/public")).json();
  let date = new Date(pub.today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 2);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  const bookingDate = date.toISOString().slice(0, 10);
  await page.getByLabel("Date", { exact: true }).fill(bookingDate);
  await page.getByLabel("Heure du rendez-vous", { exact: true }).fill("08:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ajouter un patient", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Rendez-vous", exact: true }).click();
  await page.getByText("Browser Patient", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Horaires", exact: true }).click();
  await page.getByRole("heading", { name: "Votre semaine au cabinet" }).waitFor();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.getByRole("heading", { name: "Première consultation" }).waitFor();
  await page.getByRole("button", { name: "Vue d’ensemble", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  const patient = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  patient.on("pageerror", (e) => errors.push(e.message));
  await patient.goto("http://localhost:19388/");
  await patient.getByRole("heading", { name: /Votre cœur mérite/ }).waitFor();
  assert.equal(
    await patient.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await patient.getByRole("button", { name: "Afficher la navigation" }).click();
  await patient.getByRole("link", { name: "Consultations", exact: true }).waitFor();
  await patient.getByRole("button", { name: "Afficher la navigation" }).click();
  await patient.screenshot({
    path: "artifacts/doctor-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("http://localhost:19388/");
  await page.getByRole("heading", { name: /Votre cœur mérite/ }).waitFor();
  await page.screenshot({ path: "artifacts/landing-desktop.png", fullPage: true });
  await page.screenshot({ path: "artifacts/landing-desktop-top.png" });
  await patient.goto("http://localhost:19388/doctor/ahmed-benali/book");
  await patient
    .getByRole("heading", { name: "Trouvez le créneau qui vous convient" })
    .waitFor();
  // Choisir une consultation d’une heure rend le test indépendant de l’ordre SQL.
  const firstConsultation = pub.services.find(
    (service) => service.name === "Première consultation",
  );
  await patient
    .getByLabel("Quelle consultation souhaitez-vous ?")
    .selectOption(firstConsultation.id);
  const dayNumber = String(Number(bookingDate.slice(-2)));
  await patient
    .locator(".calendar-grid")
    .getByRole("button", { name: dayNumber, exact: true })
    .click();
  await patient
    .locator(".slots")
    .getByRole("button", { name: "09:00", exact: true })
    .click();
  await patient.getByRole("button", { name: "Continuer", exact: true }).click();
  await patient.getByLabel("Prénom", { exact: true }).fill("Public");
  await patient.getByLabel("Nom", { exact: true }).fill("Patient");
  await patient.getByLabel("Numéro de téléphone").fill("+213555123457");
  await patient.getByLabel("Adresse e-mail").fill("public@example.com");
  await patient.getByRole("checkbox").check();
  await patient.getByRole("button", { name: "Vérifier le rendez-vous" }).click();
  await patient.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await patient
    .getByRole("heading", { name: "Votre rendez-vous est confirmé." })
    .waitFor();
  const googleUrl = new URL(
    await patient
      .getByRole("link", { name: "Ajouter à Google Agenda" })
      .getAttribute("href"),
  );
  assert.equal(googleUrl.hostname, "calendar.google.com");
  assert.equal(googleUrl.searchParams.get("ctz"), "Africa/Algiers");
  assert.equal(
    googleUrl.searchParams.get("dates"),
    bookingDate.replaceAll("-", "") +
      "T080000Z/" +
      bookingDate.replaceAll("-", "") +
      "T090000Z",
  );
  assert(!googleUrl.href.includes("token"));
  const downloadPromise = patient.waitForEvent("download");
  await patient.getByRole("button", { name: "Télécharger le fichier .ics" }).click();
  const calendarDownload = await downloadPromise;
  assert.equal(calendarDownload.suggestedFilename(), "rendez-vous-pulse.ics");
  await patient.screenshot({
    path: "artifacts/booking-confirmation-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await patient.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await patient
    .getByRole("button", { name: "Annuler le rendez-vous", exact: true })
    .click();
  await patient
    .getByRole("dialog")
    .getByRole("button", { name: "Annuler le rendez-vous", exact: true })
    .click();
  await patient.getByRole("heading", { name: "Rendez-vous annulé" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: desktop/mobile layout, staff login, manual booking, navigation, public booking, cancellation, and no JavaScript errors.",
  );
} finally {
  await browser?.close();
  server.kill();
}
