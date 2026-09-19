/**
 * Interface React du cabinet.
 * Les pages sont regroupées dans ce fichier pour conserver une arborescence simple.
 * Cherchez le nom d’un composant (Doctor, Booking, Dashboard...) pour le modifier.
 */
import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  LayoutDashboard,
  CalendarDays,
  Users,
  Clock,
  Settings,
  Stethoscope,
  Bell,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  CheckCheck,
  MoreHorizontal,
  X,
  ExternalLink,
  LogOut,
  SlidersHorizontal,
  ArrowDownUp,
  Sun,
  Heart,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Play,
  Pause,
  Calendar,
  FileText,
  Menu,
  HelpCircle,
  RefreshCw,
  Download,
  UserRound,
  AlertCircle,
  Star,
  ArrowLeft,
  Send,
  MessageCircle,
  Smartphone,
  Instagram,
  Linkedin,
  Facebook,
} from "lucide-react";
import "./style.css";
import {
  statusLabel,
  formatDinars,
  localDate,
  googleCalendarUrl,
  calendarFile,
} from "../scheduling.js";

// Correspondance entre les libellés français, les icônes et les adresses des pages.
const icons = {
  "Vue d’ensemble": LayoutDashboard,
  "File du jour": ArrowDownUp,
  Calendrier: CalendarDays,
  "Rendez-vous": FileText,
  Patients: Users,
  Horaires: Clock,
  Services: Stethoscope,
  Notifications: Bell,
  "Journal d’activité": FileText,
  Paramètres: Settings,
};
const paths = {
  "Vue d’ensemble": "/dashboard",
  "File du jour": "/dashboard/today",
  Calendrier: "/dashboard/calendar",
  "Rendez-vous": "/dashboard/appointments",
  Patients: "/dashboard/patients",
  Horaires: "/dashboard/schedule",
  Services: "/dashboard/services",
  Notifications: "/dashboard/notifications",
  "Journal d’activité": "/dashboard/audit-log",
  Paramètres: "/dashboard/settings",
};
// Shared display helpers keep names, dates, status labels, and API errors consistent.
const label = statusLabel;
const initials = (p) => (p ? `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}` : "AB");
const fullname = (p) => (p ? `${p.firstName} ${p.lastName}` : "Patient");
const dateText = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localDate("Africa/Algiers");
const addDay = (d, n) => {
  const a = new Date(d + "T12:00:00");
  a.setDate(a.getDate() + n);
  return iso(a);
};
// Point commun à tous les appels API : les erreurs du serveur sont affichées en français.
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
async function api(path, method = "GET", body) {
  const r = await fetch(apiBase + "/api" + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Une erreur est survenue. Veuillez réessayer.");
  return data;
}
const browserSupabase =
  import.meta.env.VITE_SUPABASE_URL &&
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
// Realtime signals contain no patient data; the page reloads authorized API data after an update.
class LiveConnection {
  constructor(url) {
    const token = new URL(url, location.origin).searchParams.get("token");
    if (browserSupabase) {
      this.channel = browserSupabase.channel("clinic-updates");
      this.socket = null;
    } else {
      this.socket = io({ auth: { token }, transports: ["websocket", "polling"] });
    }
  }
  addEventListener(event, fn) {
    if (this.channel) {
      this.channel.on("broadcast", { event }, fn).subscribe();
      return;
    }
    this.socket.on(event, fn);
    this.socket.on("connect", fn);
  }
  close() {
    if (this.channel) browserSupabase.removeChannel(this.channel);
    else this.socket.disconnect();
  }
}
function IconButton({ icon: Icon, label: aria, ...props }) {
  return (
    <button className="icon-button" title={aria} aria-label={aria} {...props}>
      <Icon size={18} />
    </button>
  );
}
function Badge({ status }) {
  return (
    <span className={"badge " + status?.toLowerCase()}>
      <i />
      {label(status)}
    </span>
  );
}
function Avatar({ patient, index = 0, size = "" }) {
  return <span className={`avatar av-${index % 5} ${size}`}>{initials(patient)}</span>;
}
/** État vide : aucune donnée de démonstration n’est injectée dans les rendez-vous. */
function Empty({
  title = "Un moment de répit",
  text = "Aucun rendez-vous pour le moment. Ajoutez un patient ou partagez votre page de réservation.",
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CalendarDays size={25} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
/** Fenêtre réutilisable, refermable avec Échap ou un clic sur le fond. */
function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Fermer la fenêtre" onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}
/** Point d’entrée : navigation, session, données du cabinet et fenêtres modales. */
function App() {
  const [path, setPath] = useState(location.pathname),
    [user, setUser] = useState(null),
    [loaded, setLoaded] = useState(false),
    [data, setData] = useState(null),
    [pub, setPub] = useState(null),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [mobile, setMobile] = useState(false);
  const go = (p) => {
    history.pushState({}, "", p);
    setPath(p.split("?")[0]);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  // Load the current session and public clinic data before rendering a page.
  useEffect(() => {
    const h = () => setPath(location.pathname);
    window.addEventListener("popstate", h);
    Promise.all([api("/me"), api("/public")])
      .then(([m, p]) => {
        setUser(m.user);
        setPub(p);
      })
      .catch((e) => setToast(e.message))
      .finally(() => setLoaded(true));
    return () => window.removeEventListener("popstate", h);
  }, []);
  const refresh = async () => {
    if (user && user.role !== "PATIENT") setData(await api("/dashboard"));
    setPub(await api("/public"));
  };
  useEffect(() => {
    if (user && user.role !== "PATIENT") {
      refresh().catch((e) => setToast(e.message));
      const es = new LiveConnection("/api/events");
      es.addEventListener("update", () => refresh().catch(() => {}));
      return () => es.close();
    } else setData(null);
  }, [user]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function mutate(url, method, body, message) {
    try {
      const result = await api(url, method, body);
      await refresh();
      if (message) setToast(message);
      return result;
    } catch (e) {
      setToast(e.message);
      throw e;
    }
  }
  const shared = {
    user,
    setUser,
    data,
    pub,
    go,
    toast: setToast,
    mutate,
    modal,
    setModal,
  };
  if (!loaded || !pub)
    return (
      <div className="loading">
        <Activity size={32} />
        <span>Chargement de votre cabinet…</span>
      </div>
    );
  const dashboard = path.startsWith("/dashboard");
  return (
    <>
      <>
        {dashboard ? (
          <Dashboard {...shared} path={path} mobile={mobile} setMobile={setMobile} />
        ) : path === "/login" || path === "/register" ? (
          <Auth {...shared} register={path === "/register"} />
        ) : path.startsWith("/appointment/") ? (
          <Tracking {...shared} id={path.split("/")[2]} />
        ) : path === "/cancel" ? (
          <CancelByCode {...shared} />
        ) : path.endsWith("/book") ? (
          <Booking {...shared} />
        ) : (
          <Doctor {...shared} />
        )}
      </>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <IconButton icon={X} label="Fermer" onClick={() => setToast("")} />
        </div>
      )}
      {modal?.type === "patient" && (
        <PatientForm
          {...shared}
          appointment={modal.appointment}
          date={modal.date}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "queue" && (
        <QueueForm
          {...shared}
          date={modal.date}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "early-arrival" && (
        <EarlyArrivalModal
          appointment={modal.appointment}
          nextAppointment={modal.nextAppointment}
          options={data?.settings?.earlyArrivalOptions || [5, 10, 15]}
          mutate={mutate}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "cancel" && (
        <Modal title="Annuler ce rendez-vous ?" onClose={() => setModal(null)}>
          <p className="modal-copy">
            Annuler {fullname(modal.appointment.patient)}, rendez-vous à{" "}
            {modal.appointment.scheduledStart}? Le patient sera informé et le rendez-vous
            restera dans son historique.
          </p>
          <div className="form-actions">
            <button className="button" onClick={() => setModal(null)}>
              Conserver le rendez-vous
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await mutate(
                    "/appointments/" + modal.appointment.id,
                    "PATCH",
                    { status: "CANCELLED" },
                    "Rendez-vous annulé",
                  );
                  setModal(null);
                } catch {}
              }}
            >
              Annuler le rendez-vous
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Tableau de bord professionnel : les données privées ne viennent que de l’API authentifiée.
 * The active route chooses the dashboard view while shared appointment data stays in one place.
 */
function Dashboard({
  path,
  user,
  data,
  pub,
  go,
  setUser,
  mutate,
  setModal,
  toast,
  mobile,
  setMobile,
}) {
  const active = Object.keys(paths).find((k) => paths[k] === path) || "Vue d’ensemble";
  const [date, setDate] = useState(pub.today || today()),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("Tous les patients"),
    [view, setView] = useState("Liste");
  const appointments = data?.appointments || [],
    selected = appointments
      .filter((a) => a.date === date)
      .sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart));
  const current = selected.find((a) => a.status === "IN_CONSULTATION"),
    next = selected.find(
      (a) => !["COMPLETED", "CANCELLED", "NO_SHOW", "IN_CONSULTATION"].includes(a.status),
    );
  const waiting = selected.filter((a) => ["ARRIVED", "WAITING"].includes(a.status));
  const completed = selected.filter((a) => a.status === "COMPLETED");
  const restricted = () => {
    toast("Connectez-vous pour gérer votre cabinet en toute sécurité.");
    go("/login");
  };
  const add = () => (user ? setModal({ type: "patient", date }) : restricted());
  const change = async (a, status) => {
    try {
      await mutate(
        "/appointments/" + a.id,
        "PATCH",
        { status },
        "Rendez-vous " + label(status).toLowerCase(),
      );
      if (status === "COMPLETED") {
        const nextAppointment = selected.find(
          (item) =>
            item.id !== a.id &&
            item.estimatedStart > a.estimatedStart &&
            !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status),
        );
        if (nextAppointment)
          setModal({ type: "early-arrival", appointment: a, nextAppointment });
      }
    } catch {}
  };
  const showQueue = (mode) =>
    user ? setModal({ type: "queue", date, mode }) : restricted();
  let visible = selected.filter((a) =>
    `${fullname(a.patient)} ${a.patient?.patientNumber} ${a.patient?.phone} ${a.patient?.email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (filter !== "Tous les patients")
    visible = visible.filter((a) =>
      filter === "À venir"
        ? ["CONFIRMED", "SCHEDULED", "RESCHEDULED"].includes(a.status)
        : a.status === filter,
    );
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          className="brand"
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            go("/dashboard");
          }}
        >
          <div className="brand-mark">
            <Activity size={26} strokeWidth={2.3} />
          </div>
          pulse<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="practice-icon">
            <Stethoscope size={20} />
          </span>
          <div>
            <strong>Cabinet médical Benali</strong>
            <small>Espace du cabinet</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">MON CABINET</div>
        <nav>
          {[
            "Vue d’ensemble",
            "File du jour",
            "Calendrier",
            "Rendez-vous",
            "Patients",
          ].map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                className={"nav-item " + (active === name ? "active" : "")}
                onClick={() => go(paths[name])}
              >
                <Icon size={19} />
                <span>{name}</span>
                {name === "File du jour" &&
                  selected.filter(
                    (a) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status),
                  ).length > 0 && (
                    <em>
                      {
                        selected.filter(
                          (a) =>
                            !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status),
                        ).length
                      }
                    </em>
                  )}
              </button>
            );
          })}
          <div className="nav-caption manage">GESTION</div>
          {[
            "Horaires",
            "Services",
            "Notifications",
            "Journal d’activité",
            "Paramètres",
          ].map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                className={"nav-item " + (active === name ? "active" : "")}
                onClick={() => go(paths[name])}
              >
                <Icon size={19} />
                <span>{name}</span>
                {name === "Notifications" && unread > 0 && (
                  <i className="notification-dot" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="booking-promo">
            <div className="promo-icon">
              <ExternalLink size={19} />
            </div>
            <h4>Votre cabinet en ligne</h4>
            <p>
              Un accès simple pour découvrir
              <br />
              le cabinet et prendre rendez-vous.
            </p>
            <button onClick={() => go("/doctor/ahmed-benali")}>
              Voir la page publique <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="help-link"
            onClick={() =>
              toast(
                "Besoin d’aide ? Contactez l’administrateur du cabinet ou consultez le guide README.md.",
              )
            }
          >
            <HelpCircle size={18} /> Aide et prise en main <ArrowUpRight size={15} />
          </button>
          <button
            className="profile"
            onClick={() => (user ? go("/dashboard/settings") : go("/login"))}
          >
            <span className="staff-avatar">{user ? user.name.slice(0, 1) : "S"}</span>
            <span>
              <strong>{user?.name || "Votre espace"}</strong>
              <small>{user ? label(user.role) : "Accès professionnel"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(!mobile)}
              aria-label="Afficher le menu"
            >
              <Menu size={20} />
            </button>
            <span>Mon cabinet</span>
            <ChevronRight size={14} />
            <strong>{active}</strong>
          </div>
          <div className="topbar-actions">
            <span className="clinic-time">
              <span className="green-dot" />
              Espace du cabinet
            </span>
            <button className="public-link" onClick={() => go("/doctor/ahmed-benali")}>
              Page de réservation <ArrowUpRight size={15} />
            </button>
            <span className="top-divider" />
            <button
              className="bell-button"
              aria-label="Notifications"
              onClick={() => go("/dashboard/notifications")}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <button
              className="top-avatar"
              aria-label={user ? "Paramètres du compte" : "Se connecter"}
              onClick={() => go(user ? "/dashboard/settings" : "/login")}
            >
              {user ? user.name[0] : "S"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <Sun size={15} /> Plus de soins. Moins de démarches.
              </div>
              <h1>
                {active === "Vue d’ensemble"
                  ? "Votre cabinet en un coup d’œil"
                  : active === "File du jour"
                    ? "La file des patients du jour"
                    : active}
              </h1>
              <p>
                {active === "Vue d’ensemble"
                  ? "Une journée bien organisée, pour vous consacrer à vos patients."
                  : active === "File du jour"
                    ? "Accompagnez chaque patient, à chaque étape de sa visite."
                    : `Gérez votre espace ${active.toLowerCase()} en toute simplicité.`}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button date-button"
                onClick={() => document.getElementById("main-date")?.showPicker()}
              >
                <CalendarDays size={16} />
                {new Date(date + "T12:00:00").toLocaleDateString("fr-DZ", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                <ChevronDown size={14} />
                <input
                  id="main-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Choisir la date du tableau de bord"
                />
              </button>
              <button className="button primary" onClick={add}>
                <Plus size={18} />
                Ajouter un patient
              </button>
            </div>
          </div>
          {!user && (
            <div className="access-banner">
              <ShieldCheck size={19} />
              <span>
                <strong>Votre cabinet est prêt.</strong> Connectez-vous pour accéder aux
                patients et gérer les rendez-vous.
              </span>
              <button onClick={() => go("/login")}>
                Espace professionnel <ArrowRight size={16} />
              </button>
            </div>
          )}
          {["Vue d’ensemble", "File du jour"].includes(active) ? (
            <>
              <div className="doctor-strip">
                <div className="doctor-identity">
                  <img
                    className="doctor-avatar"
                    src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop&crop=faces"
                    alt="Portrait du médecin"
                  />
                  <div>
                    <h3>
                      {pub.doctor.name}
                      <span className="specialty-tag">{pub.doctor.specialty}</span>
                    </h3>
                    <p>
                      <span className="green-dot" />
                      {pub.doctor.days[new Date(date + "T12:00:00").getDay()]?.enabled
                        ? "Ouvert aux rendez-vous"
                        : "Fermé aujourd’hui"}
                      <span className="dot-separator">·</span>
                      <Clock size={13} />
                      {
                        pub.doctor.days[new Date(date + "T12:00:00").getDay()]?.start
                      } – {pub.doctor.days[new Date(date + "T12:00:00").getDay()]?.end}
                      <span className="dot-separator">·</span>Salle 01
                    </p>
                  </div>
                </div>
                <button className="text-button" onClick={() => go("/dashboard/schedule")}>
                  Gérer les disponibilités <ArrowUpRight size={16} />
                </button>
              </div>
              {active === "Vue d’ensemble" && (
                <div className="stats-grid">
                  {[
                    {
                      name: "Rendez-vous",
                      value: selected.length,
                      icon: CalendarDays,
                      color: "teal",
                      note: "Prévus pour cette journée",
                      detail: "Aujourd’hui",
                    },
                    {
                      name: "Terminés",
                      value: completed.length,
                      icon: CheckCheck,
                      color: "green",
                      note: selected.length
                        ? `${Math.round((completed.length / selected.length) * 100)}% des rendez-vous du jour`
                        : "Une nouvelle journée commence",
                      progress: selected.length
                        ? (completed.length / selected.length) * 100
                        : 0,
                    },
                    {
                      name: "En attente",
                      value: waiting.length,
                      icon: Users,
                      color: "amber",
                      note: waiting.length
                        ? "Patients prêts à être reçus"
                        : "Aucun patient en attente",
                      detail: "Dans la file",
                    },
                    {
                      name: "Absences",
                      value: selected.filter((a) => a.status === "NO_SHOW").length,
                      icon: UserRound,
                      color: "rose",
                      note: "Historique conservé",
                      detail: "Aujourd’hui",
                    },
                  ].map((s) => (
                    <section className="stat-card" key={s.name}>
                      <div className="stat-top">
                        <span>{s.name}</span>
                        <span className={"stat-icon " + s.color}>
                          <s.icon size={19} />
                        </span>
                      </div>
                      <div className="stat-value">
                        {String(s.value).padStart(2, "0")}
                        {s.detail && <span>{s.detail}</span>}
                      </div>
                      {s.progress !== undefined ? (
                        <div className="stat-progress">
                          <div>
                            <i style={{ width: s.progress + "%" }} />
                          </div>
                          <small>{s.note}</small>
                        </div>
                      ) : (
                        <p>
                          <span className={"small-dot " + s.color} />
                          {s.note}
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              )}
              <div className="content-columns">
                <div className="queue-column">
                  <section className="consultation-card">
                    <div className="consultation-top">
                      <span>
                        <i className="live-dot" />
                        {current ? "EN CONSULTATION" : "SALLE DE CONSULTATION"}
                      </span>
                      <span className="room-pill">Salle 01</span>
                    </div>
                    <div className="consultation-body">
                      <Avatar patient={current?.patient} size="large" />
                      <div className="consultation-patient">
                        <h2>
                          {current
                            ? fullname(current.patient)
                            : "Prêt à accueillir le prochain patient"}
                        </h2>
                        <p>
                          {current
                            ? current.service?.name
                            : "Chaque visite mérite toute votre attention"}
                          <span>·</span>
                          {current ? current.duration : pub.doctor.duration} min
                        </p>
                      </div>
                      {current && (
                        <div className="timer">
                          <Timer start={current.actualStart} />
                          <span>Durée de consultation</span>
                        </div>
                      )}
                    </div>
                    <div className="consultation-bottom">
                      <span>
                        <Clock size={14} />
                        {current
                          ? `Début à ${new Date(current.actualStart).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit", timeZone: pub.doctor.timezone })}`
                          : "Aucune consultation en cours"}
                      </span>
                      <button
                        className="button"
                        disabled={!current && !next}
                        onClick={() =>
                          current
                            ? change(current, "COMPLETED")
                            : change(next, "IN_CONSULTATION")
                        }
                      >
                        {current ? <Check size={16} /> : <Play size={15} />}{" "}
                        {current
                          ? "Terminer la consultation"
                          : "Commencer la consultation"}
                      </button>
                    </div>
                  </section>
                  <section className="queue-card">
                    <div className="section-heading">
                      <div>
                        <h2>
                          File des rendez-vous{" "}
                          <span className="count-pill">{selected.length}</span>
                        </h2>
                        <p>Votre journée, un patient à la fois.</p>
                      </div>
                      <span className="live-label">
                        <span className="green-dot" />
                        En direct
                      </span>
                    </div>
                    <div className="queue-toolbar">
                      <div className="segmented">
                        {["Liste", "Chronologie"].map((v) => (
                          <button
                            className={view === v ? "selected" : ""}
                            onClick={() => setView(v)}
                            key={v}
                          >
                            {v === "Liste" ? (
                              <LayoutDashboard size={14} />
                            ) : (
                              <Clock size={14} />
                            )}{" "}
                            {v}
                          </button>
                        ))}
                      </div>
                      <div className="queue-tools">
                        <div className="small-search">
                          <Search size={16} />
                          <input
                            aria-label="Rechercher un rendez-vous"
                            placeholder="Rechercher un patient…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        <select
                          aria-label="Filtrer par statut"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="Tous les patients">Tous les patients</option>
                          <option value="À venir">À venir</option>
                          {[
                            "WAITING",
                            "IN_CONSULTATION",
                            "COMPLETED",
                            "NO_SHOW",
                            "CANCELLED",
                          ].map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {visible.length ? (
                      view === "Liste" ? (
                        <div className="table-scroll">
                          <table className="queue-table">
                            <thead>
                              <tr>
                                <th>HEURE</th>
                                <th>PATIENT</th>
                                <th>STATUT</th>
                                <th>DURÉE</th>
                                <th>ACTIONS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visible.map((a, i) => (
                                <tr
                                  key={a.id}
                                  className={
                                    a.status === "IN_CONSULTATION" ? "current-row" : ""
                                  }
                                >
                                  <td>
                                    <strong>{a.estimatedStart}</strong>
                                    {a.estimatedStart !== a.scheduledStart && (
                                      <small className="old-time">
                                        {a.scheduledStart}
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    <div className="patient-cell">
                                      <Avatar patient={a.patient} index={i} />
                                      <div>
                                        <strong>
                                          {fullname(a.patient)}
                                          {a.priority !== "Normal" && (
                                            <span
                                              className="priority-mark"
                                              title={label(a.priority)}
                                            >
                                              ★
                                            </span>
                                          )}
                                        </strong>
                                        <small>{a.service?.name || "Consultation"}</small>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <Badge status={a.status} />
                                  </td>
                                  <td className="duration-cell">{a.duration} min</td>
                                  <td>
                                    <div className="row-actions">
                                      {["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(
                                        a.status,
                                      ) ? (
                                        <button
                                          className="mini-action"
                                          onClick={() => change(a, "WAITING")}
                                        >
                                          Arrivé
                                        </button>
                                      ) : ["WAITING", "ARRIVED"].includes(a.status) ? (
                                        <button
                                          className="mini-action start"
                                          onClick={() => change(a, "IN_CONSULTATION")}
                                        >
                                          <Play size={11} /> Démarrer
                                        </button>
                                      ) : a.status === "IN_CONSULTATION" ? (
                                        <button
                                          className="mini-action"
                                          onClick={() => change(a, "COMPLETED")}
                                        >
                                          Terminer
                                        </button>
                                      ) : (
                                        <span className="finished-check">
                                          <Check size={16} />
                                        </span>
                                      )}
                                      <AppointmentMenu
                                        a={a}
                                        setModal={setModal}
                                        change={change}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="timeline">
                          {visible.map((a) => (
                            <div key={a.id} className="timeline-row">
                              <time>{a.estimatedStart}</time>
                              <div>
                                <strong>{fullname(a.patient)}</strong>
                                <span>
                                  {a.service?.name} · {a.duration} min
                                </span>
                                <Badge status={a.status} />
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({
                                      type: "patient",
                                      appointment: a,
                                    })
                                  }
                                >
                                  Voir le rendez-vous <ArrowRight size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <Empty
                        title={
                          query ? "Aucun patient trouvé" : "Votre journée commence ici"
                        }
                        text={
                          query
                            ? "Essayez un nom, un numéro de téléphone ou une référence de rendez-vous."
                            : "Les rendez-vous apparaîtront ici dès leur réservation."
                        }
                        action={
                          !query && (
                            <button className="button" onClick={add}>
                              <Plus size={16} />
                              Ajouter votre premier patient
                            </button>
                          )
                        }
                      />
                    )}
                    <div className="table-footer">
                      <span>
                        Affichage de {visible.length} sur {selected.length} rendez-vous
                      </span>
                      <button
                        className="text-button"
                        onClick={() => go("/dashboard/appointments")}
                      >
                        Tous les rendez-vous <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                  <div className="day-note">
                    <ShieldCheck size={16} />
                    <span>
                      Les informations de vos patients restent privées et protégées.
                    </span>
                  </div>
                </div>
                {active === "Vue d’ensemble" && (
                  <aside className="right-column">
                    <section className="next-card">
                      <div className="small-card-heading">
                        <h3>Prochain patient</h3>
                        <span className="next-number">{next ? "01" : "—"}</span>
                      </div>
                      {next ? (
                        <>
                          <div className="next-patient">
                            <Avatar patient={next.patient} size="large" index={2} />
                            <h3>{fullname(next.patient)}</h3>
                            <p>{next.service?.name}</p>
                            <Badge status={next.status} />
                          </div>
                          <div className="next-times">
                            <div>
                              <span>Prévu</span>
                              <strong>{next.scheduledStart}</strong>
                            </div>
                            <div>
                              <span>Estimé</span>
                              <strong>
                                {next.estimatedStart}
                                <span className="green-dot" />
                              </strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="next-empty">
                          <div>
                            <Users size={28} />
                          </div>
                          <h4>Un moment pour souffler</h4>
                          <p>Votre prochain patient apparaîtra ici.</p>
                        </div>
                      )}
                      <button
                        className="button primary full"
                        onClick={() => showQueue("next")}
                      >
                        <ArrowRight size={17} /> Avancer le prochain patient
                      </button>
                      <p className="next-hint">
                        Avancer l’horaire du prochain rendez-vous
                      </p>
                    </section>
                    <section className="quick-card">
                      <h3>Gardez le rythme</h3>
                      <button onClick={() => showQueue("all")}>
                        <span className="quick-icon">
                          <ArrowDownUp size={18} />
                        </span>
                        <span>
                          <strong>Décaler toute la file</strong>
                          <small>Ajuster les rendez-vous à venir</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      <button onClick={() => showQueue("delay")}>
                        <span className="quick-icon amber">
                          <Clock size={18} />
                        </span>
                        <span>
                          <strong>Ajouter un retard</strong>
                          <small>Prévenir vos patients du décalage</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    </section>
                    <MiniCalendar
                      date={date}
                      setDate={setDate}
                      appointments={appointments}
                    />
                    <div className="break-card">
                      <span>☕</span>
                      <div>
                        <strong>Une pause bien méritée</strong>
                        <p>
                          Pause déjeuner ·{" "}
                          {pub.doctor.days[new Date(date + "T12:00:00").getDay()]
                            ?.breakStart || "Sans pause"}{" "}
                          –{" "}
                          {pub.doctor.days[new Date(date + "T12:00:00").getDay()]
                            ?.breakEnd || ""}
                        </p>
                      </div>
                      <ShieldCheck size={16} />
                    </div>
                  </aside>
                )}
              </div>
            </>
          ) : active === "Calendrier" ? (
            <CalendarPage
              appointments={appointments}
              date={date}
              setDate={setDate}
              setModal={setModal}
              mutate={mutate}
            />
          ) : active === "Rendez-vous" ? (
            <AppointmentsPage
              appointments={appointments}
              setModal={setModal}
              change={change}
            />
          ) : active === "Patients" ? (
            <PatientsPage data={data} setModal={setModal} />
          ) : active === "Horaires" || active === "Paramètres" ? (
            <SettingsPage
              data={data}
              pub={pub}
              mutate={mutate}
              user={user}
              go={go}
              setUser={setUser}
              toast={toast}
              type={active}
            />
          ) : active === "Services" ? (
            <ServicesPage
              services={data?.services || pub.services}
              mutate={mutate}
              user={user}
              go={go}
            />
          ) : active === "Notifications" ? (
            <NotificationsPage data={data} mutate={mutate} />
          ) : active === "Journal d’activité" ? (
            <AuditPage data={data} />
          ) : null}
          {user && ["Vue d’ensemble", "Rendez-vous"].includes(active) && (
            <PracticeInsights appointments={appointments} date={date} />
          )}
          <footer className="main-footer">
            <span>Pensé pour votre cabinet, conçu pour vos patients.</span>
            <span>
              <span className="green-dot" />
              {user ? "Connecté au cabinet" : "La confidentialité avant tout"}
              <span className="dot-separator">·</span>Pulse © {new Date().getFullYear()}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
/** Compteur visuel calculé depuis l’heure réelle enregistrée par le serveur. */
function Timer({ start }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000));
  return (
    <strong>
      {[Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
        .map((n) => String(n).padStart(2, "0"))
        .join(":")}
    </strong>
  );
}
/** Statistiques calculées à partir des visites réelles, sans nombres fictifs. */
function PracticeInsights({ appointments, date }) {
  const weekStart = addDay(date, -((new Date(date + "T12:00:00").getDay() + 1) % 7)),
    weekEnd = addDay(weekStart, 6),
    week = appointments.filter((a) => a.date >= weekStart && a.date <= weekEnd),
    month = appointments.filter((a) => a.date.startsWith(date.slice(0, 7))),
    day = appointments.filter((a) => a.date === date);
  const completed = day.filter((a) => a.actualStart && a.actualEnd),
    arrived = day.filter((a) => a.actualStart && a.arrivedAt);
  const average = (items, fn) =>
    items.length
      ? Math.round(
          items.reduce((n, a) => n + Math.max(0, fn(a)), 0) / items.length / 60000,
        ) + " min"
      : "—";
  const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDay(weekStart, i);
      return {
        date: d,
        count: week.filter(
          (a) => a.date === d && !["CANCELLED", "NO_SHOW"].includes(a.status),
        ).length,
      };
    }),
    max = Math.max(1, ...days.map((d) => d.count));
  return (
    <section className="panel practice-insights">
      <div className="section-heading">
        <div>
          <h2>Votre activité en perspective</h2>
          <p>Des indicateurs concrets pour mieux organiser vos journées.</p>
        </div>
        <Activity size={20} />
      </div>
      <div className="insights-body">
        <div className="insight-metrics">
          {[
            ["Rendez-vous cette semaine", week.length],
            ["Rendez-vous ce mois-ci", month.length],
            ["Annulations du jour", day.filter((a) => a.status === "CANCELLED").length],
            [
              "Consultation moyenne",
              average(
                completed,
                (a) => Date.parse(a.actualEnd) - Date.parse(a.actualStart),
              ),
            ],
            [
              "Attente moyenne",
              average(
                arrived,
                (a) => Date.parse(a.actualStart) - Date.parse(a.arrivedAt),
              ),
            ],
          ].map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="weekly-activity">
          <h4>
            Patients par jour <span>Cette semaine</span>
          </h4>
          <div className="activity-bars">
            {days.map((d) => (
              <div key={d.date}>
                <span>{d.count}</span>
                <div className="bar-track">
                  <i style={{ height: Math.max(3, (d.count / max) * 70) + "px" }} />
                </div>
                <small>
                  {new Date(d.date + "T12:00:00").toLocaleDateString("fr-DZ", {
                    weekday: "short",
                  })}
                </small>
              </div>
            ))}
          </div>
          <p>Hors annulations et absences.</p>
        </div>
      </div>
    </section>
  );
}
/** Actions rapides sur une visite ; les annulations demandent une confirmation. */
function AppointmentMenu({ a, setModal, change }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="appointment-menu">
      <IconButton
        icon={MoreHorizontal}
        label="Actions du rendez-vous"
        onClick={() => setOpen(!open)}
      />
      {open && (
        <>
          <div className="menu-dismiss" onClick={() => setOpen(false)} />
          <div className="dropdown-menu">
            <button
              onClick={() => {
                setModal({ type: "patient", appointment: a });
                setOpen(false);
              }}
            >
              Voir / modifier le rendez-vous
            </button>
            {!["CANCELLED", "COMPLETED", "NO_SHOW"].includes(a.status) && (
              <>
                <button
                  onClick={() => {
                    change(a, "NO_SHOW");
                    setOpen(false);
                  }}
                >
                  Marquer comme absent
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    setModal({ type: "cancel", appointment: a });
                    setOpen(false);
                  }}
                >
                  Annuler le rendez-vous
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
/** Calendrier commun : semaine du samedi au vendredi, dates françaises. */
function MiniCalendar({ date, setDate, appointments = [], booking = false }) {
  const [month, setMonth] = useState(date.slice(0, 7));
  useEffect(() => setMonth(date.slice(0, 7)), [date]);
  const first = new Date(month + "-01T12:00:00"),
    offset = (first.getDay() + 1) % 7,
    days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const move = (n) => {
    const d = new Date(first);
    d.setMonth(d.getMonth() + n);
    setMonth(iso(d).slice(0, 7));
  };
  return (
    <section className="mini-calendar">
      <div className="calendar-heading">
        <h3>
          {first.toLocaleDateString("fr-DZ", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <div>
          <IconButton
            icon={ChevronLeft}
            label="Mois précédent"
            onClick={() => move(-1)}
          />
          <IconButton icon={ChevronRight} label="Mois suivant" onClick={() => move(1)} />
        </div>
      </div>
      <div className="calendar-grid">
        {["S", "D", "L", "M", "M", "J", "V"].map((d, i) => (
          <span className="weekday" key={"day" + i}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"empty" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = month + "-" + String(i + 1).padStart(2, "0");
          return (
            <button
              key={d}
              className={
                (d === date ? "selected " : "") + (d === today() ? "is-today" : "")
              }
              onClick={() => setDate(d)}
              disabled={booking && d < today()}
            >
              {i + 1}
              {appointments.some((a) => a.date === d) && <i />}
            </button>
          );
        })}
      </div>
      {!booking && (
        <div className="calendar-legend">
          <span className="green-dot" />
          Rendez-vous prévus
          <button onClick={() => setDate(today())}>Aujourd’hui</button>
        </div>
      )}
    </section>
  );
}
/** Ajout ou modification d’une visite ; le serveur vérifie toujours les conflits. */
function PatientForm({ data, pub, appointment: a, date, onClose, mutate }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [existing, setExisting] = useState(""),
    [service, setService] = useState(a?.serviceId || pub.services[0]?.id),
    [duration, setDuration] = useState(a?.duration || pub.doctor.duration);
  const archived = a && ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.target));
    b.duration = Number(b.duration);
    try {
      if (a) {
        const update = { notes: b.notes, priority: b.priority };
        if (
          !archived &&
          (b.date !== a.date || b.time !== a.scheduledStart || b.duration !== a.duration)
        ) {
          Object.assign(update, {
            date: b.date,
            time: b.time,
            duration: b.duration,
          });
        }
        await mutate("/appointments/" + a.id, "PATCH", update, "Rendez-vous mis à jour");
      } else await mutate("/appointments", "POST", b, "Patient ajouté au planning");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={a ? "Détails du rendez-vous" : "Ajouter un patient"}
      subtitle={
        a
          ? `Patient n° ${a.patient?.patientNumber} · ${label(a.status)}`
          : "Préparez la prochaine visite de votre patient."
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        {!a && data?.patients.length > 0 && (
          <label>
            Patient
            <select
              name="patientId"
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
            >
              <option value="">+ Créer un nouveau patient</option>
              {data.patients.map((p) => (
                <option value={p.id} key={p.id}>
                  {fullname(p)} · {p.phone}
                </option>
              ))}
            </select>
          </label>
        )}
        {!existing && (
          <div className="form-grid">
            <label>
              Prénom
              <input
                name="firstName"
                required
                defaultValue={a?.patient?.firstName}
                readOnly={!!a}
                placeholder="Ex. Ahmed"
              />
            </label>
            <label>
              Nom
              <input
                name="lastName"
                required
                defaultValue={a?.patient?.lastName}
                readOnly={!!a}
                placeholder="Ex. Benali"
              />
            </label>
            <label>
              Numéro de téléphone
              <input
                name="phone"
                type="tel"
                required
                defaultValue={a?.patient?.phone}
                readOnly={!!a}
                placeholder="0555 12 34 56"
              />
            </label>
            <label>
              Adresse e-mail
              <input
                name="email"
                type="email"
                required
                defaultValue={a?.patient?.email}
                readOnly={!!a}
                placeholder="patient@example.com"
              />
            </label>
            <label>
              Date de naissance <small>(facultatif)</small>
              <input
                name="dateOfBirth"
                type="date"
                max={today()}
                defaultValue={a?.patient?.dateOfBirth}
                readOnly={!!a}
              />
            </label>
          </div>
        )}
        <div className="form-divider">RENDEZ-VOUS</div>
        <div className="form-grid">
          <label>
            Service
            <select
              name="serviceId"
              value={service}
              disabled={!!a}
              onChange={(e) => {
                setService(e.target.value);
                setDuration(pub.services.find((s) => s.id === e.target.value).duration);
              }}
            >
              {pub.services.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Durée (minutes)
            <input
              name="duration"
              type="number"
              min="5"
              max="240"
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              readOnly={archived}
            />
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              required
              min={a ? undefined : today()}
              defaultValue={a?.date || date || today()}
              readOnly={archived}
            />
          </label>
          <label>
            Heure du rendez-vous
            <input
              name="time"
              type="time"
              required
              defaultValue={a?.scheduledStart || "09:00"}
              readOnly={archived}
            />
          </label>
          <label>
            Priorité
            <select name="priority" defaultValue={a?.priority || "Normal"}>
              <option value="Normal">Normale</option>
              <option value="Priority">Prioritaire</option>
              <option value="Urgent">Urgente</option>
            </select>
          </label>
          <label>
            Motif de consultation
            <input
              name="reason"
              defaultValue={a?.reason}
              readOnly={!!a}
              placeholder="Indiquez brièvement le motif de la visite"
            />
          </label>
        </div>
        <label>
          Notes administratives
          <textarea
            name="notes"
            defaultValue={a?.notes}
            placeholder="Informations pratiques pour la visite. Ne saisissez pas de dossier médical."
            rows="3"
          />
        </label>
        {a && (
          <div className="details-note">
            <Clock size={16} />
            <span>
              Heure estimée : {a.estimatedStart} · Début réel :{" "}
              {a.actualStart
                ? new Date(a.actualStart).toLocaleString("fr-DZ", {
                    timeZone: "Africa/Algiers",
                  })
                : "Non commencé"}{" "}
              · Fin réelle :{" "}
              {a.actualEnd
                ? new Date(a.actualEnd).toLocaleString("fr-DZ", {
                    timeZone: "Africa/Algiers",
                  })
                : "—"}
            </span>
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Enregistrement…"
              : a
                ? "Enregistrer les modifications"
                : "Ajouter un patient"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
/** Demande explicite d’avancement ou de retard : les horaires réservés restent dans l’historique. */
function QueueForm({ date, mode, onClose, mutate, pub }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        mode === "delay"
          ? "Ajouter un retard"
          : mode === "next"
            ? "Avancer le prochain patient"
            : "Décaler toute la file"
      }
      subtitle="Les patients verront immédiatement leur nouvel horaire estimé."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await mutate(
              "/queue",
              "POST",
              { date, mode, ...Object.fromEntries(new FormData(e.target)) },
              "File mise à jour et patients informés",
            );
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "delay" ? (
          <label>
            Retard (minutes)
            <input
              type="number"
              min="1"
              max="180"
              name="delay"
              defaultValue="15"
              required
            />
          </label>
        ) : (
          <label>
            Nouvelle heure de début estimée
            <input
              type="time"
              name="time"
              defaultValue={new Date().toLocaleTimeString("fr-DZ", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: pub.doctor.timezone,
              })}
              required
            />
          </label>
        )}
        <div className="info-box">
          <ShieldCheck size={19} />
          <p>
            Les pauses et les horaires du cabinet sont respectés. Les horaires initiaux
            sont conservés.{" "}
            {mode === "next"
              ? "Seul le prochain patient sera avancé."
              : "Les horaires à venir seront recalculés dans l’ordre de la file."}
          </p>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>
            Conserver les horaires
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Mise à jour…" : "Confirmer le changement"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EarlyArrivalModal({ appointment, nextAppointment, options, mutate, onClose }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [delivery, setDelivery] = useState(null);
  return (
    <Modal
      title={delivery ? "Patient prévenu" : "Avancer le prochain rendez-vous ?"}
      onClose={onClose}
    >
      {delivery ? (
        <>
          <div className="early-arrival-success">
            <CheckCircle2 size={22} />
            <p>
              L’heure estimée de {fullname(nextAppointment.patient)} est passée de{" "}
              <strong>{delivery.previousStart}</strong> à <strong>{delivery.newStart}</strong>.
            </p>
          </div>
          <p className="modal-copy">
            La page privée du patient est déjà actualisée. Envoyez-lui aussi le lien par
            SMS ou WhatsApp s’il n’a pas la page ouverte.
          </p>
          <div className="form-actions early-arrival-actions">
            <a className="button" href={delivery.smsUrl}>
              <Smartphone size={16} /> SMS
            </a>
            <a
              className="button"
              href={delivery.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
            <button className="button primary" onClick={onClose}>
              Terminer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="modal-copy">
            {fullname(nextAppointment.patient)} verra son heure estimée avancer et recevra
            un message sur sa page privée. Vous pourrez ensuite lui envoyer le lien par SMS
            ou WhatsApp.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="button" onClick={onClose}>
              Garder l’horaire
            </button>
            {options.map((minutes) => (
              <button
                className="button primary"
                key={minutes}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await mutate(
                      "/appointments/" + appointment.id + "/early-arrival",
                      "POST",
                      { minutes },
                      "Horaire avancé et patient prévenu",
                    );
                    setDelivery(result);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Avancer de {minutes} min
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * Vues jour, semaine et mois ; glisser-déposer avec confirmation et validation serveur.
 * The calendar only proposes changes; the server validates conflicts before saving them.
 */
function CalendarPage({ appointments, date, setDate, setModal, mutate }) {
  const [view, setView] = useState("Semaine"),
    [move, setMove] = useState(null);
  const start = addDay(date, -((new Date(date + "T12:00:00").getDay() + 1) % 7));
  const days =
    view === "Jour" ? [date] : Array.from({ length: 7 }, (_, i) => addDay(start, i));
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{dateText(date)}</h2>
        <div className="segmented">
          {["Jour", "Semaine", "Mois"].map((v) => (
            <button
              className={view === v ? "selected" : ""}
              onClick={() => setView(v)}
              key={v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "Mois" ? (
        <div className="month-view">
          <MiniCalendar date={date} setDate={setDate} appointments={appointments} />
          <div>
            {appointments
              .filter((a) => a.date === date)
              .map((a) => (
                <button
                  className="calendar-appointment"
                  key={a.id}
                  onClick={() => setModal({ type: "patient", appointment: a })}
                >
                  <strong>
                    {a.estimatedStart} · {fullname(a.patient)}
                  </strong>
                  <Badge status={a.status} />
                </button>
              ))}
            {!appointments.some((a) => a.date === date) && (
              <Empty text="Aucun rendez-vous à cette date." />
            )}
          </div>
        </div>
      ) : (
        <div className="week-scroll">
          <div
            className="week-grid"
            style={{
              gridTemplateColumns: `55px repeat(${days.length},minmax(120px,1fr))`,
            }}
          >
            <div />
            {days.map((d) => (
              <button
                className={"week-date " + (d === date ? "selected" : "")}
                key={d}
                onClick={() => setDate(d)}
              >
                <span>
                  {new Date(d + "T12:00:00").toLocaleDateString("fr-DZ", {
                    weekday: "short",
                  })}
                </span>
                <strong>{d.slice(-2)}</strong>
              </button>
            ))}
            {Array.from({ length: 10 }, (_, i) => i + 8).map((h) => (
              <React.Fragment key={h}>
                <span className="hour-label">{h}:00</span>
                {days.map((d) => (
                  <div
                    className="week-cell"
                    key={d}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const a = appointments.find(
                        (a) => a.id === e.dataTransfer.getData("text/plain"),
                      );
                      if (a)
                        setMove({
                          a,
                          date: d,
                          time: String(h).padStart(2, "0") + ":00",
                        });
                    }}
                  >
                    {appointments
                      .filter(
                        (a) => a.date === d && Number(a.estimatedStart.slice(0, 2)) === h,
                      )
                      .map((a) => (
                        <button
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                          className={"calendar-appointment " + a.status.toLowerCase()}
                          key={a.id}
                          onClick={() => setModal({ type: "patient", appointment: a })}
                        >
                          <strong>{fullname(a.patient)}</strong>
                          <span>
                            {a.estimatedStart} · {a.duration} min
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {move && (
        <Modal title="Déplacer le rendez-vous ?" onClose={() => setMove(null)}>
          <p>
            {fullname(move.a.patient)} sera déplacé au {move.date} à {move.time}. La
            disponibilité sera vérifiée avant l’enregistrement.
          </p>
          <div className="form-actions">
            <button className="button" onClick={() => setMove(null)}>
              Conserver le rendez-vous
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await mutate(
                    "/appointments/" + move.a.id,
                    "PATCH",
                    { date: move.date, time: move.time },
                    "Rendez-vous déplacé",
                  );
                  setMove(null);
                } catch {}
              }}
            >
              Confirmer le déplacement
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
/** Liste et recherche dans les rendez-vous du cabinet. */
function AppointmentsPage({ appointments, setModal, change }) {
  const [q, setQ] = useState("");
  const list = appointments
    .filter((a) =>
      `${fullname(a.patient)} ${a.patient?.patientNumber} ${a.patient?.phone} ${a.patient?.email}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) => (b.date + b.scheduledStart).localeCompare(a.date + a.scheduledStart));
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>
          Tous les rendez-vous <span className="count-pill">{list.length}</span>
        </h2>
        <div className="small-search">
          <Search size={16} />
          <input
            placeholder="Rechercher un rendez-vous…"
            aria-label="Rechercher un rendez-vous"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {list.length ? (
        <div className="table-scroll">
          <table className="queue-table">
            <thead>
              <tr>
                <th>PATIENT</th>
                <th>DATE ET HEURE</th>
                <th>N° PATIENT</th>
                <th>STATUT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={a.id}>
                  <td>
                    <div className="patient-cell">
                      <Avatar patient={a.patient} index={i} />
                      <strong>{fullname(a.patient)}</strong>
                    </div>
                  </td>
                  <td>
                    {a.date}
                    <small>
                      {a.scheduledStart} · Estimé à {a.estimatedStart}
                    </small>
                  </td>
                  <td>{a.patient?.patientNumber}</td>
                  <td>
                    <Badge status={a.status} />
                  </td>
                  <td>
                    <AppointmentMenu a={a} setModal={setModal} change={change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
    </section>
  );
}
/** Répertoire des patients et historique de leurs visites, réservé au personnel. */
function PatientsPage({ data, setModal }) {
  const [q, setQ] = useState(""),
    [patient, setPatient] = useState(null);
  const patients = (data?.patients || []).filter((p) =>
    `${fullname(p)} ${p.phone} ${p.email} ${(data?.appointments || [])
      .filter((a) => a.patientId === p.id)
      .map((a) => a.patient?.patientNumber)
      .join(" ")}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>
          Vos patients <span className="count-pill">{patients.length}</span>
        </h2>
        <div className="small-search">
          <Search size={16} />
          <input
            aria-label="Rechercher un patient"
            placeholder="Nom, téléphone, e-mail ou référence…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {patients.length ? (
        <div className="patient-directory">
          {patients.map((p, i) => (
            <button
              className="patient-directory-card"
              key={p.id}
              onClick={() => setPatient(p)}
            >
              <Avatar patient={p} index={i} size="large" />
              <h3>{fullname(p)}</h3>
              <p>{p.email}</p>
              <p>{p.phone}</p>
              <span>
                Historique des rendez-vous <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Chaque patient compte"
          text="Les patients sont ajoutés à votre répertoire lors de la réservation d’un rendez-vous."
        />
      )}
      {patient && (
        <Modal
          title={fullname(patient)}
          subtitle={patient.email + " · " + patient.phone}
          onClose={() => setPatient(null)}
        >
          {data.appointments
            .filter((a) => a.patientId === patient.id)
            .map((a) => (
              <button
                className="history-item"
                key={a.id}
                onClick={() => {
                  setPatient(null);
                  setModal({ type: "patient", appointment: a });
                }}
              >
                <div>
                  <strong>
                    {a.date} · {a.scheduledStart}
                  </strong>
                  <small>
                    {a.service?.name} · Patient n° {a.patient?.patientNumber}
                  </small>
                </div>
                <Badge status={a.status} />
              </button>
            ))}
        </Modal>
      )}
    </section>
  );
}
/** Paramètres du cabinet, horaires, jours fermés et rappels. */
function SettingsPage({ data, pub, mutate, user, go, setUser, toast, type }) {
  const [s, setS] = useState(data?.settings || pub.doctor),
    [saved, setSaved] = useState(false),
    [err, setErr] = useState(""),
    [staffModal, setStaffModal] = useState(false),
    [busy, setBusy] = useState(false),
    [clearPassword, setClearPassword] = useState(""),
    [clearError, setClearError] = useState(""),
    [clearBusy, setClearBusy] = useState(false);
  useEffect(() => setS(data?.settings || pub.doctor), [data?.settings, pub.doctor]);
  const update = (k, v) => {
    setS({ ...s, [k]: v });
    setSaved(false);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!user) {
      go("/login");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await mutate("/settings", "PUT", s, "Paramètres du cabinet enregistrés");
      setSaved(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const clearData = async () => {
    if (!window.confirm("Supprimer définitivement les patients, rendez-vous, notifications et journal ?")) return;
    setClearBusy(true);
    setClearError("");
    try {
      await api("/data/clear", "POST", { password: clearPassword });
      setUser(null);
      go("/login");
    } catch (e) {
      setClearError(e.message);
    } finally {
      setClearBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="settings-layout">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>
              {type === "Paramètres"
                ? "Informations du cabinet"
                : "Votre semaine au cabinet"}
            </h2>
            <p>
              {type === "Paramètres"
                ? "Les informations visibles sur la page publique du cabinet."
                : "Définissez vos jours de consultation et vos pauses."}
            </p>
          </div>
          <Clock size={23} />
        </div>
        {type === "Paramètres" ? (
          <div className="form-grid">
            <label>
              Nom du médecin
              <input
                value={s.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </label>
            <label>
              Spécialité
              <input
                value={s.specialty}
                onChange={(e) => update("specialty", e.target.value)}
                required
              />
            </label>
            <label>
              E-mail du cabinet
              <input
                type="email"
                value={s.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </label>
            <label>
              Téléphone
              <input
                value={s.phone}
                onChange={(e) => update("phone", e.target.value)}
                required
              />
            </label>
            <label className="span-2">
              Adresse du cabinet
              <input
                value={s.address}
                onChange={(e) => update("address", e.target.value)}
                required
              />
            </label>
            <label>
              Instagram
              <input
                type="url"
                placeholder="https://instagram.com/..."
                value={s.socials?.instagram || ""}
                onChange={(e) => update("socials", { ...s.socials, instagram: e.target.value })}
              />
            </label>
            <label>
              Facebook
              <input
                type="url"
                placeholder="https://facebook.com/..."
                value={s.socials?.facebook || ""}
                onChange={(e) => update("socials", { ...s.socials, facebook: e.target.value })}
              />
            </label>
            <label>
              LinkedIn
              <input
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={s.socials?.linkedin || ""}
                onChange={(e) => update("socials", { ...s.socials, linkedin: e.target.value })}
              />
            </label>
            <label>
              WhatsApp
              <input
                type="url"
                placeholder="https://wa.me/213..."
                value={s.socials?.whatsapp || ""}
                onChange={(e) => update("socials", { ...s.socials, whatsapp: e.target.value })}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="hours-labels">
              <span>JOUR</span>
              <span>DÉBUT</span>
              <span>FIN</span>
              <span>DÉBUT PAUSE</span>
              <span>FIN PAUSE</span>
            </div>
            {[6, 0, 1, 2, 3, 4, 5].map((i) => (
              <div
                className={"hours-row " + (!s.days[i].enabled ? "disabled" : "")}
                key={i}
              >
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={s.days[i].enabled}
                    onChange={(e) => {
                      const days = [...s.days];
                      days[i] = { ...days[i], enabled: e.target.checked };
                      update("days", days);
                    }}
                  />
                  <span>
                    {
                      [
                        "Dimanche",
                        "Lundi",
                        "Mardi",
                        "Mercredi",
                        "Jeudi",
                        "Vendredi",
                        "Samedi",
                      ][i]
                    }
                  </span>
                </label>
                {["start", "end", "breakStart", "breakEnd"].map((k) => (
                  <input
                    key={k}
                    aria-label={`${["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][i]} ${k}`}
                    type="time"
                    disabled={!s.days[i].enabled}
                    value={s.days[i][k]}
                    onChange={(e) => {
                      const days = [...s.days];
                      days[i] = { ...days[i], [k]: e.target.value };
                      update("days", days);
                    }}
                  />
                ))}
              </div>
            ))}
          </>
        )}
        <div className="form-grid settings-general">
          <label>
            Durée par défaut (min)
            <input
              type="number"
              min="5"
              max="240"
              value={s.duration}
              onChange={(e) => update("duration", Number(e.target.value))}
            />
          </label>
          <label>
            Fuseau horaire du cabinet
            <select
              value={s.timezone}
              onChange={(e) => update("timezone", e.target.value)}
            >
              <option value="Africa/Algiers">Algérie — UTC+1</option>
            </select>
          </label>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <span className="save-hint">
            {saved
              ? "Toutes les modifications sont enregistrées."
              : "Les rendez-vous existants sont vérifiés avant l’enregistrement."}
          </span>
          <button className="button primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer les modifications"}
            <Check size={16} />
          </button>
        </div>
      </section>
      <div>
        <section className="panel settings-panel">
          <h3>Congés et jours fériés</h3>
          <p className="muted">La réservation sera fermée pour ces dates.</p>
          {s.holidays.map((h, i) => (
            <div className="holiday" key={i}>
              <span>
                <strong>{h.date}</strong>
                <small>{h.reason}</small>
              </span>
              <IconButton
                icon={X}
                label="Supprimer ce jour de fermeture"
                onClick={() =>
                  update(
                    "holidays",
                    s.holidays.filter((_, j) => i !== j),
                  )
                }
              />
            </div>
          ))}
          <label>
            Date
            <input type="date" id="holiday-date" min={today()} />
          </label>
          <label>
            Motif
            <select id="holiday-reason">
              {[
                "Jour férié",
                "Congés",
                "Congrès",
                "Fermeture exceptionnelle",
                "Absence personnelle",
                "Autre",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button full"
            onClick={() => {
              const d = document.getElementById("holiday-date").value;
              if (d && !s.holidays.some((h) => h.date === d))
                update("holidays", [
                  ...s.holidays,
                  {
                    date: d,
                    reason: document.getElementById("holiday-reason").value,
                  },
                ]);
            }}
          >
            <Plus size={16} />
            Ajouter une fermeture
          </button>
        </section>
        <section className="panel settings-panel">
          <h3>Rappels de rendez-vous</h3>
          <p className="muted">
            Les rappels s’affichent sur la page de suivi. L’envoi par e-mail nécessite un
            service configuré.
          </p>
          {[24, 2].map((h) => (
            <label className="checkbox-label" key={h}>
              <input
                type="checkbox"
                checked={s.reminders.includes(h)}
                onChange={(e) =>
                  update(
                    "reminders",
                    e.target.checked
                      ? [...s.reminders, h]
                      : s.reminders.filter((n) => n !== h),
                  )
                }
              />
              {h} heures avant le rendez-vous
            </label>
          ))}
          <p className="muted">Alertes juste avant le rendez-vous</p>
          {[5, 10, 15].map((minutes) => (
            <label className="checkbox-label" key={"minute" + minutes}>
              <input
                type="checkbox"
                checked={(s.minuteReminders || [10, 5]).includes(minutes)}
                onChange={(e) =>
                  update(
                    "minuteReminders",
                    e.target.checked
                      ? [...(s.minuteReminders || []), minutes]
                      : (s.minuteReminders || []).filter((n) => n !== minutes),
                  )
                }
              />
              {minutes} minutes avant, pour le patient et le cabinet
            </label>
          ))}
          <p className="muted">Arrivée anticipée proposée au patient suivant</p>
          {[5, 10, 15].map((minutes) => (
            <label className="checkbox-label" key={"early" + minutes}>
              <input
                type="checkbox"
                checked={(s.earlyArrivalOptions || [5, 10, 15]).includes(minutes)}
                onChange={(e) =>
                  update(
                    "earlyArrivalOptions",
                    e.target.checked
                      ? [...(s.earlyArrivalOptions || []), minutes]
                      : (s.earlyArrivalOptions || []).filter((n) => n !== minutes),
                  )
                }
              />
              Proposer {minutes} minutes d’avance
            </label>
          ))}
        </section>
        {user && (
          <section className="panel settings-panel">
            <h3>Votre compte</h3>
            <p className="muted">
              {user.email} · {label(user.role)}
            </p>
            {user.role === "ADMIN" && (
              <button
                className="button full"
                type="button"
                onClick={() => setStaffModal(true)}
              >
                <Plus size={16} />
                Ajouter un collaborateur
              </button>
            )}
            <button
              className="button full signout"
              type="button"
              onClick={async () => {
                await api("/logout", "POST");
                setUser(null);
                go("/login");
              }}
            >
              <LogOut size={16} />
              Se déconnecter
            </button>
            <div className="danger-zone">
              <h3>Réinitialiser les données</h3>
              <p className="muted">
                Supprime les patients, rendez-vous, notifications et journal. Les services,
                horaires et paramètres du cabinet sont conservés.
              </p>
              <label>
                Mot de passe du compte
                <input
                  type="password"
                  value={clearPassword}
                  onChange={(e) => setClearPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                />
              </label>
              {clearError && <div className="form-error">{clearError}</div>}
              <button
                className="button danger full"
                type="button"
                disabled={clearBusy || !clearPassword}
                onClick={clearData}
              >
                {clearBusy ? "Suppression…" : "Supprimer les données du cabinet"}
              </button>
            </div>
          </section>
        )}
      </div>
      {staffModal && (
        <Modal title="Créer un compte professionnel" onClose={() => setStaffModal(false)}>
          <div>
            <StaffForm onClose={() => setStaffModal(false)} toast={toast} />
          </div>
        </Modal>
      )}
    </form>
  );
}
/** Création de comptes professionnels, autorisée uniquement à l’administrateur côté serveur. */
function StaffForm({ onClose, toast }) {
  const [err, setErr] = useState("");
  return (
    <div className="staff-form">
      <label>
        Nom complet
        <input id="staff-name" />
      </label>
      <label>
        E-mail
        <input id="staff-email" type="email" />
      </label>
      <label>
        Mot de passe provisoire
        <input id="staff-password" type="password" minLength="12" />
      </label>
      <label>
        Rôle
        <select id="staff-role">
          <option value="SECRETARIAT">Secrétariat</option>
          <option value="DOCTOR">Médecin</option>
          <option value="ADMIN">Administrateur</option>
        </select>
      </label>
      {err && <div className="form-error">{err}</div>}
      <button
        className="button primary full"
        type="button"
        onClick={async () => {
          try {
            await api(
              "/users",
              "POST",
              Object.fromEntries(
                ["name", "email", "password", "role"].map((k) => [
                  k,
                  document.getElementById("staff-" + k).value,
                ]),
              ),
            );
            toast("Compte professionnel créé");
            onClose();
          } catch (e) {
            setErr(e.message);
          }
        }}
      >
        Créer le compte
      </button>
    </div>
  );
}
/** Prestations, durées et tarifs en dinars algériens. */
function ServicesPage({ services, mutate, user, go }) {
  const [edit, setEdit] = useState(null),
    [err, setErr] = useState("");
  return (
    <>
      <div className="service-page-heading">
        <span className="muted">
          Des consultations adaptées aux besoins de chaque patient.
        </span>
        <button
          className="button primary"
          onClick={() =>
            user
              ? setEdit({
                  name: "",
                  description: "",
                  duration: 60,
                  price: 0,
                  enabled: true,
                })
              : go("/login")
          }
        >
          <Plus size={16} />
          Ajouter une prestation
        </button>
      </div>
      <div className="services-grid">
        {services.map((s, i) => (
          <section className="panel service-card" key={s.id}>
            <div className={"service-symbol av-" + i}>
              <Heart size={24} />
            </div>
            <h2>{s.name}</h2>
            <p>{s.description}</p>
            <div className="service-meta">
              <span>
                <Clock size={15} />
                {s.duration} minutes
              </span>
              <strong>{formatDinars(s.price)}</strong>
            </div>
            <div className="service-bottom">
              <Badge status={s.enabled ? "AVAILABLE" : "DISABLED"} />
              <button
                className="text-button"
                onClick={() => (user ? setEdit(s) : go("/login"))}
              >
                Modifier la prestation <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
        ))}
      </div>
      {edit && (
        <Modal
          title={edit.id ? "Modifier la prestation" : "Ajouter une prestation"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await mutate("/services", "POST", edit, "Prestation enregistrée");
                setEdit(null);
              } catch (e) {
                setErr(e.message);
              }
            }}
          >
            <label>
              Nom de la prestation
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Durée (minutes)
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={edit.duration}
                  onChange={(e) => setEdit({ ...edit, duration: Number(e.target.value) })}
                  required
                />
              </label>
              <label>
                Tarif (DA)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={edit.price}
                  onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edit.enabled}
                onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })}
              />
              Disponible à la réservation
            </label>
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              <button className="button primary">Enregistrer la prestation</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
/** Messages envoyés aux patients et état de l’envoi des e-mails. */
function NotificationsPage({ data, mutate }) {
  const ns = [...(data?.notifications || [])].reverse();
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Notifications aux patients</h2>
          <p>Confirmations, changements d’horaire et rappels.</p>
        </div>
        <button
          className="button"
          disabled={!ns.length}
          onClick={() =>
            mutate(
              "/notifications/read",
              "POST",
              {},
              "Notifications marquées comme lues",
            ).catch(() => {})
          }
        >
          <CheckCheck size={16} />
          Tout marquer comme lu
        </button>
      </div>
      {ns.length ? (
        ns.map((n) => (
          <div className={"notification-row " + (!n.read ? "unread" : "")} key={n.id}>
            <div className="notification-icon">
              <Bell size={19} />
            </div>
            <div>
              <strong>{n.message}</strong>
              <p>
                {new Date(n.createdAt).toLocaleString("fr-DZ", {
                  timeZone: "Africa/Algiers",
                })}{" "}
                · Suivi en ligne : envoyé · E-mail : {label(n.emailStatus)}
              </p>
            </div>
            {!n.read && <span className="green-dot" />}
          </div>
        ))
      ) : (
        <Empty
          title="Vous êtes à jour"
          text="Les confirmations et les changements d’horaire apparaîtront ici."
        />
      )}
    </section>
  );
}
/** Journal chronologique : qui a changé quoi et à quel moment. */
function AuditPage({ data }) {
  // Des intitulés compréhensibles remplacent les noms techniques dans le journal.
  // Les jetons privés ne sont jamais affichés dans les détails de l’historique.
  const fieldNames = {
    id: "Identifiant",
    patientId: "Identifiant du patient",
    doctorId: "Identifiant du médecin",
    serviceId: "Identifiant de la prestation",
    number: "Référence",
    date: "Date",
    scheduledStart: "Heure réservée",
    scheduledEnd: "Fin réservée",
    estimatedStart: "Heure estimée",
    estimatedEnd: "Fin estimée",
    actualStart: "Début réel",
    actualEnd: "Fin réelle",
    arrivedAt: "Arrivée",
    duration: "Durée",
    status: "Statut",
    priority: "Priorité",
    notes: "Notes",
    reason: "Motif",
    createdAt: "Création",
    updatedAt: "Modification",
    scheduledStartAt: "Début réservé (UTC)",
    scheduledEndAt: "Fin réservée (UTC)",
    estimatedStartAt: "Début estimé (UTC)",
    estimatedEndAt: "Fin estimée (UTC)",
    name: "Nom",
    firstName: "Prénom",
    lastName: "Nom",
    phone: "Téléphone",
    email: "E-mail",
    dateOfBirth: "Date de naissance",
    description: "Description",
    price: "Tarif (DA)",
    enabled: "Ouvert",
    timezone: "Fuseau horaire",
    currency: "Devise",
    locale: "Langue",
    specialty: "Spécialité",
    address: "Adresse",
    days: "Horaires",
    holidays: "Fermetures",
    reminders: "Rappels",
    start: "Début",
    end: "Fin",
    breakStart: "Début de pause",
    breakEnd: "Fin de pause",
    role: "Rôle",
    time: "Heure",
  };
  const readable = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (Array.isArray(value)) return value.map(readable);
    if (typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) => !["accessToken", "hash", "salt", "regionalVersion"].includes(key),
          )
          .map(([key, child]) => [fieldNames[key] || key, readable(child)]),
      );
    return typeof value === "string" ? label(value) : value;
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Activité du cabinet</h2>
          <p>Retrouvez chaque modification, son auteur et sa date.</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      {data?.audit.length ? (
        <div className="audit-list">
          {data.audit.map((a) => (
            <details key={a.id}>
              <summary>
                <span className="audit-icon">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{a.action}</strong>
                  <small>
                    {a.actor} ·{" "}
                    {new Date(a.at).toLocaleString("fr-DZ", {
                      timeZone: "Africa/Algiers",
                    })}
                  </small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="audit-values">
                <div>
                  <strong>Avant</strong>
                  <pre>{JSON.stringify(readable(a.before), null, 2)}</pre>
                </div>
                <div>
                  <strong>Après</strong>
                  <pre>{JSON.stringify(readable(a.after), null, 2)}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty
          title="Un nouveau départ"
          text="Les modifications importantes seront enregistrées ici automatiquement."
        />
      )}
    </section>
  );
}

/** Navigation commune aux pages publiques et au parcours de réservation. */
function PublicHeader({ go }) {
  const [menuOpen, setMenuOpen] = useState(false),
    [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`public-header ${scrolled ? "is-scrolled" : ""}`}>
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          go("/");
        }}
        aria-label="Pulse, accueil"
      >
        <div className="brand-mark">
          <Activity size={25} />
        </div>
        pulse<span className="brand-dot">.</span>
      </a>
      <button
        className="public-menu-button icon-button"
        aria-label="Afficher la navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <nav className={menuOpen ? "is-open" : ""} aria-label="Navigation principale">
        <a href="/#about" onClick={() => setMenuOpen(false)}>
          Le cabinet
        </a>
        <a href="/#services" onClick={() => setMenuOpen(false)}>
          Consultations
        </a>
        <a href="/#visit" onClick={() => setMenuOpen(false)}>
          Votre visite
        </a>
        <a href="/#contact" onClick={() => setMenuOpen(false)}>
          Contact
        </a>
        <a href="/cancel" onClick={() => setMenuOpen(false)}>
          Annuler un rendez-vous
        </a>
        <button className="button staff-link" onClick={() => go("/login")}>
          Espace professionnel <ArrowUpRight size={15} />
        </button>
      </nav>
    </header>
  );
}

function CancelByCode({ go }) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api("/cancel-by-code", "POST", {
        cancellationCode: code,
      });
      setMessage(result.message);
      setCode("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-page">
      <PublicHeader go={go} />
      <section className="auth-card cancel-code-card">
        <span className="success-icon">
          <CalendarDays size={28} />
        </span>
        <h1>Annuler un rendez-vous</h1>
        <p className="muted">
          Entrez le code indiqué sur votre reçu. L’annulation est possible uniquement au
          moins 24 heures avant le rendez-vous.
        </p>
        <form onSubmit={submit}>
          <label>
            Code d’annulation
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ANN-XXXXXXXX"
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="info-box">{message}</div>}
          <button className="button primary full" disabled={busy}>
            {busy ? "Annulation…" : "Annuler le rendez-vous"}
          </button>
        </form>
      </section>
    </div>
  );
}

/**
 * Page d’accueil : les coordonnées, les tarifs et les horaires viennent du serveur.
 * Les textes de présentation n’inventent ni diplôme, ni avis, ni ancienneté.
 */
function Doctor({ pub, go }) {
  const doctor = pub.doctor;
  const book = (serviceId) =>
    go("/doctor/ahmed-benali/book" + (serviceId ? "?service=" + serviceId : ""));
  const weekdays = [
    "Dimanche",
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
  ];
  const weekOrder = [6, 0, 1, 2, 3, 4, 5];
  const todayRule = doctor.days[new Date(pub.today + "T12:00:00").getDay()];
  const closedToday =
    !todayRule.enabled || doctor.holidays.some((day) => day.date === pub.today);
  const mapLink =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(doctor.address);
  const consultationIcons = [Stethoscope, Heart, Activity];

  return (
    <div className="public-page landing-page">
      <PublicHeader go={go} />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <div className="landing-kicker">
              <span className="green-dot" /> CARDIOLOGIE · ALGÉRIE
            </div>
            <h1 id="landing-title">
              Votre cœur mérite
              <br />
              toute notre
              <br />
              <em>attention.</em>
              <span className="hero-title-dot">✳</span>
            </h1>
            <p>
              Un médecin à votre écoute. Un accompagnement à votre rythme. Prenez soin de
              votre santé cardiovasculaire avec le{" "}
              {doctor.name.replace(/^Dr\.?\s*/, "Dr ")}.
            </p>
            <div className="landing-hero-actions">
              <button className="button primary" onClick={() => book()}>
                Prendre rendez-vous <ArrowUpRight size={19} />
              </button>
              <a className="landing-text-link" href="#about">
                Découvrir le cabinet <ArrowRight size={16} />
              </a>
            </div>
            <div className="landing-reassurance">
              <ShieldCheck size={20} />
              <p>
                Réservation en quelques clics.
                <br />
                <strong>Vos informations restent confidentielles.</strong>
              </p>
            </div>
            <div className="hero-proof-row" aria-label="Repères du cabinet">
              <div>
                <strong>{doctor.days.filter((day) => day.enabled).length}/7</strong>
                <span>jours ouverts</span>
              </div>
              <div>
                <strong>{pub.services.length}</strong>
                <span>consultations</span>
              </div>
              <div>
                <strong>DA</strong>
                <span>tarifs clairs</span>
              </div>
            </div>
          </div>
          <div className="landing-hero-visual">
            <div className="portrait-arch">
              <img
                src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=1000&h=1200&fit=crop&crop=faces"
                alt="Portrait de présentation du cabinet"
                fetchPriority="high"
              />
              <div className="portrait-gradient" />
              <div className="landing-doctor-name">
                <span>VOTRE MÉDECIN</span>
                <h2>{doctor.name}</h2>
                <p>
                  {doctor.specialty} <span>·</span> {doctor.address}
                </p>
              </div>
            </div>
            <div className="hero-care-tag">
              <span>
                <Heart size={20} />
              </span>
              <div>
                La santé du cœur,<strong>une relation de confiance.</strong>
              </div>
            </div>
            <div className="hero-hours-tag">
              <span className="hours-icon">
                <Clock size={23} />
              </span>
              <div>
                <strong>
                  {closedToday
                    ? "Réservez votre prochain créneau"
                    : `Aujourd’hui, ${todayRule.start} – ${todayRule.end}`}
                </strong>
                <p>
                  {closedToday
                    ? "Les disponibilités sont en ligne"
                    : "Un accueil sur rendez-vous"}
                </p>
              </div>
              <span className="green-dot" />
            </div>
            <span className="portrait-side-note">À VOS CÔTÉS, POUR VOTRE SANTÉ</span>
            <svg
              className="hero-heartline"
              viewBox="0 0 190 55"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 29H43L55 18L66 37L81 4L98 51L114 22L125 29H189"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </section>

        <section className="landing-practical" aria-label="Informations pratiques">
          <div>
            <CalendarDays size={23} />
            <p>
              <strong>Des créneaux en temps réel</strong>
              <span>Choisissez le jour qui vous convient.</span>
            </p>
          </div>
          <div>
            <MapPin size={23} />
            <p>
              <strong>Votre cabinet en Algérie</strong>
              <span>Des soins de proximité, un suivi attentif.</span>
            </p>
          </div>
          <div>
            <ShieldCheck size={23} />
            <p>
              <strong>Des tarifs en dinars</strong>
              <span>Clairs dès la réservation, réglés au cabinet.</span>
            </p>
          </div>
        </section>

        <section id="about" className="landing-about landing-section">
          <div className="about-editorial">
            <span className="landing-kicker">LE CABINET</span>
            <h2>
              Avant tout,
              <br />
              prendre le temps
              <br />
              <em>de vous écouter.</em>
            </h2>
            <div className="about-signature">
              <span className="signature-mark">
                <Activity size={25} />
              </span>
              <div>
                <strong>{doctor.name}</strong>
                <span>{doctor.specialty}</span>
              </div>
            </div>
          </div>
          <div className="about-explanation">
            <p className="about-lead">
              Derrière chaque rendez-vous, il y a une personne. Ses questions, son
              quotidien, ses projets.
            </p>
            <p>
              De la première consultation au suivi régulier, le cabinet vous accueille
              pour faire le point sur votre santé cardiovasculaire, répondre à vos
              questions et vous accompagner dans votre parcours de soins.
            </p>
            <div className="care-values">
              {[
                {
                  icon: Heart,
                  title: "Une relation humaine",
                  text: "Un échange attentif, dans le respect de votre rythme.",
                },
                {
                  icon: Stethoscope,
                  title: "Une approche personnalisée",
                  text: "Une consultation centrée sur vos besoins et vos questions.",
                },
                {
                  icon: ShieldCheck,
                  title: "Un suivi en toute sérénité",
                  text: "Des informations claires, de la réservation à votre visite.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <span>
                    <Icon size={19} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="services" className="landing-services landing-section">
          <div className="landing-section-heading">
            <div>
              <span className="landing-kicker">NOS CONSULTATIONS</span>
              <h2>
                Le bon accompagnement,
                <br />
                <em>au bon moment.</em>
              </h2>
            </div>
            <p>
              Un premier bilan, une question, un suivi.
              <br />
              Choisissez la consultation adaptée à votre visite.
            </p>
          </div>
          <div className="landing-service-grid">
            {pub.services.map((service, index) => {
              const Icon = consultationIcons[index % consultationIcons.length];
              return (
                <article className="landing-service-card" key={service.id}>
                  <div className="service-card-top">
                    <span className="landing-service-icon">
                      <Icon size={25} />
                    </span>
                    <span className="service-index">0{index + 1}</span>
                  </div>
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <div className="landing-service-price">
                    <span>
                      <Clock size={15} />
                      {service.duration} min
                    </span>
                    <strong>{formatDinars(service.price)}</strong>
                  </div>
                  <button onClick={() => book(service.id)}>
                    Réserver cette consultation <ArrowUpRight size={18} />
                  </button>
                </article>
              );
            })}
          </div>
          <p className="landing-price-note">
            <ShieldCheck size={14} /> Aucun paiement en ligne. Le règlement s’effectue au
            cabinet, en dinars algériens.
          </p>
        </section>

        <section id="visit" className="landing-visit landing-section">
          <div className="landing-section-heading">
            <div>
              <span className="landing-kicker">VOTRE VISITE, SIMPLEMENT</span>
              <h2>
                Moins de démarches.
                <br />
                <em>Plus de tranquillité.</em>
              </h2>
            </div>
            <button className="landing-text-link" onClick={() => book()}>
              Choisir mon créneau <ArrowRight size={17} />
            </button>
          </div>
          <div className="visit-steps">
            {[
              {
                number: "01",
                icon: CalendarDays,
                title: "Choisissez votre créneau",
                text: "Consultez les disponibilités et réservez l’horaire qui vous convient, depuis votre téléphone ou votre ordinateur.",
              },
              {
                number: "02",
                icon: CheckCircle2,
                title: "Recevez votre confirmation",
                text: "Retrouvez les détails de votre visite sur votre lien privé et ajoutez le rendez-vous à Google Agenda.",
              },
              {
                number: "03",
                icon: Clock,
                title: "Venez l’esprit tranquille",
                text: "Avant votre visite, consultez l’horaire estimé en direct. Votre page de suivi reflète les changements du cabinet.",
              },
            ].map(({ number, icon: Icon, title, text }) => (
              <article key={number}>
                <div className="visit-step-top">
                  <span>{number}</span>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="landing-contact landing-section">
          <div className="contact-details">
            <span className="landing-kicker">ON VOUS ACCUEILLE</span>
            <h2>
              Votre prochaine visite
              <br />
              <em>commence ici.</em>
            </h2>
            <p className="contact-intro">
              Une question avant de venir ? Le cabinet est à votre disposition pour vous
              renseigner.
            </p>
            <a
              className="contact-line"
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <MapPin size={21} />
              </span>
              <div>
                <small>LE CABINET</small>
                <strong>{doctor.address}</strong>
              </div>
              <ArrowUpRight size={18} />
            </a>
            <a className="contact-line" href={"tel:" + doctor.phone.replaceAll(" ", "")}>
              <span>
                <Phone size={21} />
              </span>
              <div>
                <small>TÉLÉPHONE</small>
                <strong>{doctor.phone}</strong>
              </div>
              <ArrowUpRight size={18} />
            </a>
            <a className="contact-line" href={"mailto:" + doctor.email}>
              <span>
                <Mail size={21} />
              </span>
              <div>
                <small>E-MAIL</small>
                <strong>{doctor.email}</strong>
              </div>
              <ArrowUpRight size={18} />
            </a>
            {[
              ["instagram", "Instagram", Instagram],
              ["facebook", "Facebook", Facebook],
              ["linkedin", "LinkedIn", Linkedin],
              ["whatsapp", "WhatsApp", MessageCircle],
            ].filter(([network]) => doctor.socials?.[network]).length > 0 && (
              <div className="social-links">
                <small>RÉSEAUX SOCIAUX</small>
                <div>
                  {[
                    ["instagram", "Instagram", Instagram],
                    ["facebook", "Facebook", Facebook],
                    ["linkedin", "LinkedIn", Linkedin],
                    ["whatsapp", "WhatsApp", MessageCircle],
                  ]
                    .filter(([network]) => doctor.socials?.[network])
                    .map(([network, name, Icon]) => (
                      <a
                        key={network}
                        href={doctor.socials[network]}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={name}
                        title={name}
                      >
                        <Icon size={18} />
                      </a>
                    ))}
                </div>
              </div>
            )}
            <a
              className="button map-button"
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir l’itinéraire sur Google Maps <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="landing-hours">
            <div className="landing-hours-heading">
              <span>
                <Clock size={23} />
              </span>
              <div>
                <h3>Les horaires du cabinet</h3>
                <p>Heure locale d’Algérie · UTC+1</p>
              </div>
            </div>
            <div className="landing-hours-list">
              {weekOrder.map((day) => (
                <div
                  key={day}
                  className={
                    day === new Date(pub.today + "T12:00:00").getDay()
                      ? "current-day"
                      : ""
                  }
                >
                  <span>
                    {weekdays[day]}
                    {day === new Date(pub.today + "T12:00:00").getDay() && (
                      <i>Aujourd’hui</i>
                    )}
                  </span>
                  <strong>
                    {doctor.days[day].enabled
                      ? doctor.days[day].start + " – " + doctor.days[day].end
                      : "Fermé"}
                  </strong>
                </div>
              ))}
            </div>
            <p className="hours-footnote">
              Les pauses et les fermetures exceptionnelles sont prises en compte dans les
              créneaux disponibles.
            </p>
            <button className="button primary full" onClick={() => book()}>
              Voir les disponibilités <ArrowRight size={17} />
            </button>
          </div>
        </section>

        <section className="landing-faq landing-section">
          <div>
            <span className="landing-kicker">VOS QUESTIONS</span>
            <h2>
              Quelques réponses
              <br />
              <em>avant votre visite.</em>
            </h2>
          </div>
          <div className="faq-list">
            {[
              {
                q: "Comment prendre rendez-vous ?",
                a: "Choisissez une consultation, une date et un horaire disponible. Renseignez vos coordonnées puis confirmez. Votre page de suivi privée s’affiche immédiatement.",
              },
              {
                q: "Comment ajouter mon rendez-vous à Google Agenda ?",
                a: "Sur votre confirmation, cliquez sur « Ajouter à Google Agenda ». Un événement prérempli s’ouvre dans votre compte Google : il vous suffit de l’enregistrer. Vous pouvez aussi télécharger le fichier .ics pour un autre agenda.",
              },
              {
                q: "Que faire si je ne peux pas venir ?",
                a: "Utilisez votre lien privé pour annuler un rendez-vous à venir, ou contactez directement le cabinet. Vous pouvez ensuite réserver un autre créneau.",
              },
              {
                q: "L’horaire de mon rendez-vous peut-il changer ?",
                a: "La durée des consultations peut varier. Votre page de suivi affiche l’horaire estimé en direct. Google Agenda conserve l’événement que vous avez enregistré : les mises à jour du cabinet ne s’y synchronisent pas automatiquement.",
              },
              {
                q: "Le paiement est-il demandé en ligne ?",
                a: "Non. Les tarifs sont affichés en dinars algériens (DA). Vous réglez votre consultation directement au cabinet.",
              },
            ].map(({ q, a }) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="landing-final-cta">
          <div>
            <span className="landing-kicker">PRENEZ UN MOMENT POUR VOUS</span>
            <h2>
              Votre santé mérite
              <br />
              une place dans votre agenda.
            </h2>
          </div>
          <button className="button" onClick={() => book()}>
            Prendre rendez-vous <ArrowUpRight size={20} />
          </button>
          <Activity
            className="cta-heartline"
            size={170}
            strokeWidth={0.8}
            aria-hidden="true"
          />
        </section>
      </main>
      <footer className="landing-footer">
        <a className="brand" href="/" aria-label="Pulse, accueil">
          <div className="brand-mark">
            <Activity size={22} />
          </div>
          pulse<span className="brand-dot">.</span>
        </a>
        <p>
          La santé, une relation de confiance.
          <span>
            © {new Date().getFullYear()} · {doctor.name} · Algérie
          </span>
        </p>
        <button onClick={() => go("/dashboard")}>
          Accès au cabinet <ArrowUpRight size={15} />
        </button>
      </footer>
      <div className="landing-mobile-book">
        <button className="button primary full" onClick={() => book()}>
          Prendre rendez-vous <ArrowUpRight size={18} />
        </button>
      </div>
    </div>
  );
}

/** Connexion et création d’un compte patient ; les droits ne sont jamais choisis par le navigateur. */
function Auth({ go, setUser, register }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="public-page">
      <PublicHeader go={go} />
      <div className="auth-layout">
        <div className="auth-message">
          <div className="public-eyebrow">VOTRE CABINET, EN TOUTE SÉRÉNITÉ</div>
          <h1>
            Moins de démarches.
            <br />
            <em>Plus de soins.</em>
          </h1>
          <p>
            Un espace unique pour vos rendez-vous, vos patients et l’organisation de vos
            journées.
          </p>
          <div className="auth-art">
            <Activity size={130} strokeWidth={1} />
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="art-heart">
              <Heart size={28} />
            </span>
            <span className="art-calendar">
              <CalendarDays size={29} />
            </span>
          </div>
        </div>
        <section className="auth-card">
          <span className="auth-icon">
            <ShieldCheck size={27} />
          </span>
          <h2>{register ? "Créez votre compte patient" : "Heureux de vous retrouver"}</h2>
          <p>
            {register
              ? "Réservez et retrouvez vos rendez-vous simplement."
              : "Connectez-vous à votre espace Pulse."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const b = Object.fromEntries(new FormData(e.target));
              try {
                if (register) {
                  await api("/register", "POST", b);
                }
                const result = await api("/login", "POST", b);
                setUser(result.user);
                go(
                  result.user.role === "PATIENT"
                    ? "/doctor/ahmed-benali/book"
                    : "/dashboard",
                );
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <label>
                Votre nom
                <input
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="Votre nom complet"
                />
              </label>
            )}
            <label>
              Adresse e-mail
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                placeholder="vous@exemple.fr"
              />
            </label>
            <label>
              Mot de passe
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 12 : undefined}
                required
                placeholder={
                  register ? "Au moins 12 caractères" : "Saisissez votre mot de passe"
                }
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Veuillez patienter…"
                : register
                  ? "Créer le compte"
                  : "Se connecter"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Vous avez déjà un compte ?" : "Nouveau patient ?"}{" "}
            <button onClick={() => go(register ? "/login" : "/register")}>
              {register ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
          <div className="auth-note">
            <ShieldCheck size={16} />
            Vos informations sont privées et protégées.
          </div>
        </section>
      </div>
    </div>
  );
}
/** Réservation en trois étapes : créneau, coordonnées, puis confirmation serveur. */
function Booking({ pub, go, toast }) {
  const [step, setStep] = useState(1),
    [service, setService] = useState(
      new URLSearchParams(location.search).get("service") || pub.services[0]?.id,
    ),
    [date, setDate] = useState(pub.today),
    [time, setTime] = useState(""),
    [slots, setSlots] = useState([]),
    [patient, setPatient] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const s = pub.services.find((s) => s.id === service) || pub.services[0];
  useEffect(() => {
    let cancelled = false;
    setTime("");
    setLoading(true);
    api("/slots?date=" + date + "&service=" + service)
      .then((r) => {
        if (!cancelled) setSlots(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, service]);
  return (
    <div className="public-page">
      <PublicHeader go={go} />
      <div className="booking-layout">
        <div className="booking-intro">
          <button className="text-button" onClick={() => go("/doctor")}>
            <ArrowLeft size={15} /> Retour à la page du médecin
          </button>
          <h1>
            Prenez le temps
            <br />
            de prendre soin de vous.
          </h1>
          <p>Quelques étapes simples, en toute sérénité.</p>
          <div className="booking-doctor">
            <img
              className="doctor-avatar"
              src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop&crop=faces"
              alt={pub.doctor.name}
            />
            <div>
              <h3>{pub.doctor.name}</h3>
              <p>{pub.doctor.specialty}</p>
            </div>
          </div>
          <div className="booking-summary">
            <h4>VOTRE CONSULTATION</h4>
            <p>
              <Stethoscope size={17} />
              {s?.name}
            </p>
            <p>
              <Clock size={17} />
              {s?.duration} minutes
            </p>
            <p>
              <CalendarDays size={17} />
              {dateText(date)}
              {time ? " · " + time : ""}
            </p>
            <p>
              <MapPin size={17} />
              {pub.doctor.address}
            </p>
            <div>
              <span>Tarif de la consultation</span>
              <strong>{formatDinars(s?.price)}</strong>
            </div>
            <small>Le règlement s’effectue au cabinet, en dinars algériens.</small>
          </div>
          <p className="privacy-note">
            <ShieldCheck size={18} />
            Vos coordonnées sont partagées uniquement avec le cabinet.
          </p>
        </div>
        <section className="booking-card">
          <div className="booking-steps">
            {["Le créneau", "Vos coordonnées", "Confirmation"].map((v, i) => (
              <div className={step >= i + 1 ? "active" : ""} key={v}>
                <span>{step > i + 1 ? <Check size={16} /> : i + 1}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {step === 1 ? (
            <>
              <h2>Trouvez le créneau qui vous convient</h2>
              <p className="muted">
                Choisissez votre consultation et un horaire disponible.
              </p>
              <label>
                Quelle consultation souhaitez-vous ?
                <select value={service} onChange={(e) => setService(e.target.value)}>
                  {pub.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration} min
                    </option>
                  ))}
                </select>
              </label>
              <div className="booking-date-grid">
                <MiniCalendar date={date} setDate={setDate} booking />
                <div className="slot-section">
                  <h4>Créneaux disponibles</h4>
                  <small>{pub.doctor.timezone}</small>
                  <div className="slots">
                    {loading ? (
                      <p>Recherche des disponibilités…</p>
                    ) : slots.length ? (
                      slots.map((t) => (
                        <button
                          className={time === t ? "selected" : ""}
                          onClick={() => setTime(t)}
                          key={t}
                        >
                          {t}
                        </button>
                      ))
                    ) : (
                      <p className="no-slots">
                        Aucun créneau disponible ce jour-là. Choisissez une autre date.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-actions">
                <button
                  className="button primary"
                  disabled={!time}
                  onClick={() => setStep(2)}
                >
                  Continuer <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <h2>Faisons connaissance</h2>
              <p className="muted">Quelques informations pour préparer votre visite.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPatient(Object.fromEntries(new FormData(e.target)));
                  setStep(3);
                }}
              >
                <div className="form-grid">
                  <label>
                    Prénom
                    <input name="firstName" required defaultValue={patient.firstName} />
                  </label>
                  <label>
                    Nom
                    <input name="lastName" required defaultValue={patient.lastName} />
                  </label>
                  <label>
                    Numéro de téléphone
                    <input
                      name="phone"
                      type="tel"
                      required
                      defaultValue={patient.phone}
                    />
                  </label>
                  <label>
                    Adresse e-mail
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={patient.email}
                    />
                  </label>
                  <label>
                    Date de naissance <small>(facultatif)</small>
                    <input
                      name="dateOfBirth"
                      type="date"
                      max={today()}
                      defaultValue={patient.dateOfBirth}
                    />
                  </label>
                </div>
                <label>
                  Motif de votre visite <small>(facultatif)</small>
                  <textarea name="reason" rows="3" defaultValue={patient.reason} />
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" required />
                  J’accepte de transmettre ces informations au cabinet pour la gestion de
                  mon rendez-vous.
                </label>
                <div className="form-actions">
                  <button type="button" className="button" onClick={() => setStep(1)}>
                    Retour
                  </button>
                  <button className="button primary">
                    Vérifier le rendez-vous <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <span className="review-icon">
                <CheckCircle2 size={28} />
              </span>
              <h2>Tout est prêt pour votre visite</h2>
              <p className="muted">
                Vérifiez vos informations avant de confirmer le rendez-vous.
              </p>
              <div className="review-details">
                {[
                  ["Patient", fullname(patient)],
                  ["E-mail", patient.email],
                  ["Téléphone", patient.phone],
                  ["Médecin", pub.doctor.name],
                  ["Service", s?.name],
                  ["Date", dateText(date)],
                  ["Heure", time + " · " + pub.doctor.timezone],
                  ["Adresse", pub.doctor.address],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="form-actions">
                <button className="button" onClick={() => setStep(2)}>
                  Retour
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const a = await api("/book", "POST", {
                        ...patient,
                        serviceId: service,
                        date,
                        time,
                      });
                      go("/appointment/" + a.id + "?token=" + a.token);
                      toast("Votre rendez-vous a bien été réservé");
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Confirmation…" : "Confirmer le rendez-vous"}
                  <Check size={17} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
/** Suivi privé en direct et export vers Google Agenda ou un fichier ICS. */
function Tracking({ id, go }) {
  const [a, setA] = useState(null),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState(false);
  const token = new URLSearchParams(location.search).get("token") || "";
  useEffect(() => {
    const load = () =>
      api("/appointment/" + id + "?token=" + encodeURIComponent(token))
        .then(setA)
        .catch((e) => setError(e.message));
    load();
    const es = new LiveConnection("/api/events?token=" + encodeURIComponent(token));
    es.addEventListener("update", load);
    return () => es.close();
  }, [id, token]);
  function download() {
    const content = calendarFile(a, a.doctor);
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "rendez-vous-pulse.ics";
    el.click();
    URL.revokeObjectURL(url);
  }
  function phoneLink(kind) {
    const phone = String(a.patient?.phone || "").replace(/[^\d+]/g, "");
    const trackingUrl = `${location.origin}/appointment/${a.id}?token=${encodeURIComponent(token)}`;
    const message = `Bonjour ${a.patient?.firstName || ""}, voici votre lien de rendez-vous : ${trackingUrl}\nAjouter à Google Agenda : ${googleCalendarUrl(a, a.doctor)}`;
    return kind === "whatsapp"
      ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`
      : `sms:${phone}?body=${encodeURIComponent(message)}`;
  }
  function downloadReceipt() {
    const receipt = [
      "PULSE - RECU DE RENDEZ-VOUS",
      "================================",
      `Patient : ${fullname(a.patient)}`,
      `Numero patient : ${a.patient?.patientNumber || "-"}`,
      `Date : ${dateText(a.date)}`,
      `Heure : ${a.scheduledStart}`,
      `Medecin : ${a.doctor.name}`,
      `Service : ${a.service.name}`,
      `Code d'annulation : ${a.cancellationCode || "Voir le lien prive"}`,
      "",
      "Annulation possible au moins 24 heures avant le rendez-vous.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([receipt], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "recu-rendez-vous-pulse.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="public-page">
      <PublicHeader go={go} />
      <section className="tracking-card">
        {error ? (
          <div className="form-error">{error}</div>
        ) : !a ? (
          <p>Chargement de votre rendez-vous…</p>
        ) : (
          <>
            <span className="success-icon">
              <CheckCircle2 size={35} />
            </span>
            <div className="public-eyebrow">VOTRE RENDEZ-VOUS, EN UN SEUL ENDROIT</div>
            <h1>
              {a.status === "CANCELLED"
                ? "Rendez-vous annulé"
                : "Votre rendez-vous est confirmé."}
            </h1>
            <p>
              {a.status === "CANCELLED"
                ? "Vous pouvez réserver une nouvelle consultation quand vous le souhaitez."
                : "Votre consultation est réservée. Nous serons heureux de vous accueillir."}
            </p>
            <span className="reference">
              {a.patient?.patientNumber || "Numéro indisponible"}
            </span>
            <div className="info-box">
              <ShieldCheck size={19} />
              <p>
                Code d’annulation : <strong>{a.cancellationCode || "Disponible dans votre reçu"}</strong>
                <br />Conservez ce code. L’annulation est possible au moins 24 heures avant le rendez-vous.
              </p>
            </div>
            <div className="tracking-times">
              <div>
                <span>Horaire prévu</span>
                <strong>{a.scheduledStart}</strong>
              </div>
              <div>
                <span>
                  <span className="green-dot" />
                  Horaire estimé en direct
                </span>
                <strong>{a.estimatedStart}</strong>
              </div>
            </div>
            {a.notifications.some((n) => n.kind === "EARLY_ARRIVAL") && (
              <div className="early-arrival-alert">
                <ArrowUpRight size={19} />
                <p>
                  <strong>Votre rendez-vous a été avancé.</strong>
                  <br />
                  Le cabinet a terminé plus tôt. Votre heure estimée est maintenant{" "}
                  <strong>{a.estimatedStart}</strong>. Si vous êtes proche, vous pouvez
                  arriver plus tôt.
                </p>
              </div>
            )}
            <Badge status={a.status} />
            <div className="review-details">
              {[
                ["Patient", fullname(a.patient)],
                ["Médecin", a.doctor.name],
                ["Service", a.service.name],
                ["Date", dateText(a.date)],
                ["Adresse", a.doctor.address],
                ["Fuseau horaire", a.doctor.timezone],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <div className="tracking-actions">
              {!["CANCELLED", "NO_SHOW"].includes(a.status) && (
                <a
                  className="button primary google-calendar-button"
                  href={googleCalendarUrl(a, a.doctor)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarDays size={18} />
                  Ajouter à Google Agenda
                  <ArrowUpRight size={15} />
                </a>
              )}
              {!["CANCELLED", "NO_SHOW"].includes(a.status) && (
                <>
                  <a className="button" href={phoneLink("sms")}>
                    <Smartphone size={16} />
                    Envoyer par SMS
                  </a>
                  <a
                    className="button"
                    href={phoneLink("whatsapp")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} />
                    Envoyer par WhatsApp
                  </a>
                </>
              )}
              {a.googleCalendar?.configured && !a.googleCalendar.connected && (
                <a
                  className="button"
                  href={`/auth/google/start/${a.id}?token=${encodeURIComponent(token)}`}
                >
                  <CalendarDays size={16} />
                  Synchroniser avec Google Agenda
                </a>
              )}
              {a.googleCalendar?.connected && (
                <span className="calendar-export-note">Google Agenda synchronisé</span>
              )}
              <button className="button" onClick={download}>
                <Download size={16} />
                Télécharger le fichier .ics
              </button>
              <button className="button" onClick={downloadReceipt}>
                <Download size={16} />
                Télécharger le reçu
              </button>
              {!["CANCELLED", "COMPLETED", "NO_SHOW", "IN_CONSULTATION"].includes(
                a.status,
              ) && (
                <button className="button" onClick={() => setCancel(true)}>
                  Annuler le rendez-vous
                </button>
              )}
            </div>
            <p className="calendar-export-note">
              {a.googleCalendar?.connected
                ? "Votre agenda Google est synchronisé automatiquement avec les changements du cabinet."
                : "L’ajout simple crée une copie dans votre agenda. Pour synchroniser automatiquement les changements, utilisez « Synchroniser avec Google Agenda »."}
            </p>
            <div className="info-box">
              <ShieldCheck size={19} />
              <p>
                Conservez ce lien privé pour suivre votre rendez-vous. Ne le partagez pas
                : il donne accès aux détails de votre réservation.
              </p>
            </div>
            <div className="patient-updates">
              <h3>Les nouvelles de votre cabinet</h3>
              {[...a.notifications].reverse().map((n) => (
                <div key={n.id}>
                  <Bell size={16} />
                  <p>
                    {n.message}
                    <small>
                      {new Date(n.createdAt).toLocaleString("fr-DZ", {
                        timeZone: "Africa/Algiers",
                      })}
                    </small>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        {cancel && (
          <Modal title="Annuler votre rendez-vous ?" onClose={() => setCancel(false)}>
            <p>Votre réservation sera annulée et le cabinet sera informé.</p>
            <div className="form-actions">
              <button className="button" onClick={() => setCancel(false)}>
                Conserver le rendez-vous
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  try {
                    await api(
                      "/appointment/" + id + "/cancel?token=" + encodeURIComponent(token),
                      "POST",
                    );
                    setCancel(false);
                    setA(
                      await api(
                        "/appointment/" + id + "?token=" + encodeURIComponent(token),
                      ),
                    );
                  } catch (e) {
                    setError(e.message);
                    setCancel(false);
                  }
                }}
              >
                Annuler le rendez-vous
              </button>
            </div>
          </Modal>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
