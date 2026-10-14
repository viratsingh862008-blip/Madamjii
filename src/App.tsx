import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowRight, BarChart3, Bell, BookHeart, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleHelp, Clock3, Copy, Droplets, Heart, HeartHandshake, LayoutDashboard,
  Leaf, LockKeyhole, LogOut, Menu, MessageCircle, Moon, Pill, Plus, ShieldCheck, Sparkles,
  Sun, Utensils, X,
} from "lucide-react";
import {
  acceptCareInvitation, createCareInvitation, createCareSpace, getMemberships,
  signInWithPassword, signUpWithPassword, signOut, supabase, supabaseConfigured, type AuthSession, type CareMembership,
} from "./lib/supabase";
import type { CareRole } from "./lib/care";
import {
  createTestNotification, enableBrowserPush, listNotifications, markNotificationRead,
  showLocalNotification, type AppNotification,
} from "./lib/notifications";

type View = "today" | "schedule" | "messages" | "checkin" | "journal" | "reports" | "settings";
const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "schedule", label: "My schedule", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "checkin", label: "Daily check-in", icon: Heart },
  { id: "journal", label: "My journal", icon: BookHeart },
  { id: "reports", label: "Progress", icon: BarChart3 },
];
const previewTasks = [
  { id: "meal", time: "9:00 AM", title: "A little nourishment", detail: "Breakfast · Something gentle and filling", icon: Utensils, tone: "peach" },
  { id: "water", time: "11:30 AM", title: "A little hydration", detail: "A glass of water and a pause", icon: Droplets, tone: "blue" },
  { id: "medicine", time: "1:00 PM", title: "Medicine reminder", detail: "Follow your prescribed instructions", icon: Pill, tone: "sage" },
];
const viewCopy: Record<View, { title: string; subtitle: string }> = {
  today: { title: "One thing at a time.", subtitle: "You don't have to do everything at once. Let's take the next small step together." },
  schedule: { title: "Your rhythm, your way.", subtitle: "Personal routines and shared plans, all in one gentle place." },
  messages: { title: "A little reminder that you're cared for.", subtitle: "Messages from someone who wants you to feel supported." },
  checkin: { title: "How are you, really?", subtitle: "A small check-in is enough. You don't have to have the perfect words." },
  journal: { title: "A space just for you.", subtitle: "Your journal is private by default. Your thoughts belong to you." },
  reports: { title: "Progress, without pressure.", subtitle: "Look for small steps and patterns, never perfection." },
  settings: { title: "Your care, your choices.", subtitle: "Manage your account, privacy and notification preferences." },
};
function localTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; }
  catch { return "Asia/Kolkata"; }
}
function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "♡";
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [memberships, setMemberships] = useState<CareMembership[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [previewRole, setPreviewRole] = useState<CareRole>("friend");
  const [view, setView] = useState<View>("today");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [careSpaceName, setCareSpaceName] = useState("Our care space");
  const [inviteUrl, setInviteUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get("invite"));
  const [notificationItems, setNotificationItems] = useState<AppNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState("Not enabled");

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function refreshMemberships() {
    if (!supabase || !session) return;
    setMembershipLoading(true);
    try { setMemberships(await getMemberships()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't load your care space."); }
    finally { setMembershipLoading(false); }
  }

  useEffect(() => {
    if (!session || !supabase) return;
    setMembershipLoading(true);
    getMemberships()
      .then(setMemberships)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load your care space."))
      .finally(() => setMembershipLoading(false));
  }, [session?.user.id]);

  async function handleAcceptInvite(scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean }) {
    if (!pendingInviteToken) return;
    setBusy(true);
    setError("");
    try {
      await acceptCareInvitation(pendingInviteToken, scope);
      setPendingInviteToken(null);
      window.history.replaceState({}, "", window.location.pathname);
      setNotice("You're connected. Your shared care space is ready.");
      await refreshMemberships();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This invitation couldn't be accepted.");
    } finally {
      setBusy(false);
    }
  }
  function declineInvite() {
    setPendingInviteToken(null);
    window.history.replaceState({}, "", window.location.pathname);
    setNotice("Invitation declined. No shared care data was accessed.");
  }

  const membership = memberships[0];
  const isPreview = !supabaseConfigured;

  async function refreshNotifications(showNewPush = false) {
    if (!session || !supabase) return;
    try {
      const next = await listNotifications();
      setNotificationItems((previous) => {
        if (showNewPush && previous.length > 0 && next.length > 0) {
          const known = new Set(previous.map((item) => item.id));
          const newest = next.filter((item) => !known.has(item.id)).slice(0, 3);
          newest.forEach((item) => { void showLocalNotification(item).catch(() => undefined); });
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load notifications.");
    }
  }

  useEffect(() => {
    if (!session || !supabase) { setNotificationItems([]); return; }
    void refreshNotifications(false);
    const interval = window.setInterval(() => { void refreshNotifications(true); }, 45000);
    return () => window.clearInterval(interval);
  }, [session?.user.id]);

  async function handleCreateTestNotification() {
    setNotificationBusy(true); setError("");
    try {
      await createTestNotification();
      await refreshNotifications(false);
      setNotice("Test notification saved to your notification centre.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't create a test notification.");
    } finally { setNotificationBusy(false); }
  }

  async function handleMarkNotificationRead(item: AppNotification) {
    if (item.read_at) return;
    try {
      await markNotificationRead(item.id);
      setNotificationItems((items) => items.map((current) => current.id === item.id ? { ...current, read_at: new Date().toISOString() } : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't update this notification.");
    }
  }

  async function handleEnablePush() {
    setNotificationBusy(true); setError("");
    try {
      const result = await enableBrowserPush();
      const messages: Record<string, string> = {
        enabled: "Browser push is subscribed on this device. Background delivery still needs the server-side VAPID sender to be configured.",
        unsupported: "This browser does not support Web Push. In-app notifications remain available.",
        "missing-key": "Push setup needs VITE_VAPID_PUBLIC_KEY in the Vercel environment. Do not put the private VAPID key in the frontend.",
        denied: "Notification permission was not granted. You can still see updates in the in-app notification centre.",
      };
      setPushStatus(messages[result]);
      if (result === "enabled") setNotice(messages[result]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't enable browser push.");
    } finally { setNotificationBusy(false); }
  }
  const role: CareRole = isPreview ? previewRole : (membership?.role ?? "friend");
  const copy = viewCopy[view];

  async function handlePasswordAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (authMode === "signup") await signUpWithPassword(fullName.trim(), password);
      else await signInWithPassword(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't authenticate your account.");
    } finally { setBusy(false); }
  }
  async function handleCreateCareSpace(
    event: FormEvent<HTMLFormElement>,
    scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean },
  ) {
    event.preventDefault(); setBusy(true); setError("");
    try { await createCareSpace(careSpaceName, localTimezone(), scope); await refreshMemberships(); setNotice("Your private care space has been created."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't create your care space."); }
    finally { setBusy(false); }
  }
  async function handleCreateInvite() {
    if (!membership) return;
    setBusy(true); setError("");
    try {
      const token = await createCareInvitation(membership.care_space_id);
      const url = window.location.origin + "/?invite=" + encodeURIComponent(token);
      setInviteUrl(url);
      try { await navigator.clipboard.writeText(url); setNotice("Private invitation link created and copied. Share it only with your friend."); }
      catch { setNotice("Private invitation link created. Copy it below and share it only with your friend."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't create the invitation."); }
    finally { setBusy(false); }
  }
  async function handleSignOut() {
    setBusy(true); setError("");
    try { await signOut(); setMemberships([]); setInviteUrl(""); setNotice("You've signed out."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't sign out."); }
    finally { setBusy(false); }
  }

  if (authLoading) return <LoadingScreen label="Opening your care space…" />;
  if (supabaseConfigured && !session) {
    return <AuthScreen username={username} setUsername={setUsername} password={password} setPassword={setPassword} fullName={fullName} setFullName={setFullName} mode={authMode} setMode={setAuthMode} onSubmit={handlePasswordAuth} busy={busy} error={error} />;
  }
  if (supabaseConfigured && session && pendingInviteToken) {
    return <InvitationConsentScreen busy={busy} error={error} onAccept={handleAcceptInvite} onDecline={declineInvite} />;
  }
  if (supabaseConfigured && session && membershipLoading) return <LoadingScreen label="Loading your private space…" />;
  if (supabaseConfigured && session && memberships.length === 0) {
    return <OnboardingScreen email={String(session.user.user_metadata?.full_name ?? "Member")} name={careSpaceName} setName={setCareSpaceName} onCreate={handleCreateCareSpace} busy={busy} error={error} onSignOut={handleSignOut} />;
  }

  return (
    <div className="min-h-screen bg-cream text-forest">
      {mobileNavOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-forest/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <aside className={"sidebar-shell " + (mobileNavOpen ? "sidebar-open" : "")}>
        <div className="flex items-center gap-3 px-2">
          <div className="brand-mark"><HeartHandshake size={22} /></div>
          <div><div className="font-display text-xl font-semibold tracking-tight">Are You OK?<span className="text-sage"></span></div><div className="text-[10px] uppercase tracking-[.2em] text-muted">Personal care companion</div></div>
          <button className="ml-auto rounded-xl p-2 hover:bg-sage-light lg:hidden" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>
        <div className="mt-9 rounded-2xl border border-line bg-white/70 p-3"><div className="flex items-center gap-3"><div className="avatar-soft">{isPreview ? (role === "admin" ? "A" : "♡") : initials(String(session?.user.user_metadata?.full_name ?? "Friend"))}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{isPreview ? (role === "admin" ? "Care admin" : "Your care space") : String(session?.user.user_metadata?.full_name ?? "Member")}</div><div className="mt-0.5 text-xs text-muted">{role === "admin" ? "Care coordinator" : "Your personal space"}</div></div><span className="h-2 w-2 rounded-full bg-sage" /></div></div>
        <div className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.19em] text-muted">Your space</div>
        <nav className="mt-3 flex flex-col gap-1">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { setView(item.id); setMobileNavOpen(false); }} className={"nav-link " + (view === item.id ? "nav-link-active" : "")}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{isPreview && item.id === "messages" && <span className="ml-auto rounded-full bg-sage-light px-2 py-0.5 text-[10px] text-forest">2</span>}</button>; })}</nav>
        <div className="mt-auto pt-8"><div className="care-note"><div className="flex items-center gap-2 text-sm font-semibold"><Heart size={15} /> A gentle reminder</div><p className="mt-2 text-xs leading-5 text-muted">You don't have to do everything today. Small steps count, too.</p><div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-sage-dark"><Leaf size={12} /> CARE AT YOUR OWN PACE</div></div><button className="nav-link mt-3 w-full" onClick={() => setView("settings")}><CircleHelp size={18} /> Help & settings</button>{supabaseConfigured && <button className="nav-link mt-1 w-full" disabled={busy} onClick={handleSignOut}><LogOut size={18} /> Sign out</button>}</div>
      </aside>

      <main className="min-h-screen lg:pl-[268px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-line/80 bg-cream/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3"><button className="rounded-xl border border-line bg-white p-2 lg:hidden" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button><div><div className="text-xs text-muted">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</div><div className="mt-1 text-sm font-semibold">{isPreview ? "A space to feel supported" : (membership?.care_spaces?.name ?? "Your care space")}</div></div></div>
          <div className="flex items-center gap-2 sm:gap-3">{isPreview ? <span className="preview-pill"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Preview mode</span> : <span className="connected-pill"><ShieldCheck size={13} /> Connected</span>}{supabaseConfigured && <button onClick={handleSignOut} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium text-forest transition hover:bg-sage-light disabled:opacity-50" aria-label="Sign out"><LogOut size={16} /><span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span></button>}<button className="relative rounded-xl border border-line bg-white p-2.5 text-forest transition hover:bg-sage-light" aria-label="Open notifications" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((open) => !open); if (!notificationOpen) void refreshNotifications(false); }}><Bell size={18} />{notificationItems.some((item) => !item.read_at) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-terracotta ring-2 ring-cream" />}</button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-sage-light text-sm font-semibold text-forest sm:flex">{isPreview ? (role === "admin" ? "A" : "♡") : initials(String(session?.user.user_metadata?.full_name ?? "F"))}</div></div>
        </header>
        {notificationOpen && <section className="sticky top-[76px] z-20 mx-4 mt-3 max-w-xl rounded-2xl border border-line bg-white p-4 shadow-soft sm:mx-auto sm:mr-7 lg:mr-10">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Notifications</h2><p className="mt-1 text-xs text-muted">Private to your account · retained for up to 90 days</p></div><button className="rounded-lg p-1.5 text-muted hover:bg-cream" aria-label="Close notifications" onClick={() => setNotificationOpen(false)}><X size={16} /></button></div>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {notificationItems.length === 0 ? <p className="rounded-xl bg-cream p-4 text-xs leading-5 text-muted">No notifications yet. Use the test button below to verify the in-app notification centre.</p> : notificationItems.map((item) => <button key={item.id} onClick={() => void handleMarkNotificationRead(item)} className={"block w-full rounded-xl border p-3 text-left transition hover:bg-cream " + (item.read_at ? "border-line bg-white" : "border-sage/40 bg-sage-light/40")}><span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{item.title}</span>{!item.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sage-dark" />}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.body}</span><span className="mt-2 block text-[10px] text-muted">{new Date(item.created_at).toLocaleString()}</span></button>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><button disabled={notificationBusy} className="button-secondary flex-1 justify-center" onClick={() => void handleCreateTestNotification()}>{notificationBusy ? "Working…" : "Create test notification"}</button><button className="button-quiet" onClick={() => { setNotificationOpen(false); setView("settings"); }}>Push settings</button></div>
        </section>}
        <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">
          {notice && <InlineNotice kind="success" text={notice} onClose={() => setNotice("")} />}
          {error && <InlineNotice kind="error" text={error} onClose={() => setError("")} />}
          {isPreview && <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Sparkles size={18} className="mt-0.5 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">You're exploring a preview</p><p className="mt-0.5 text-xs leading-5 text-amber-900/80">Sample tasks and messages are illustrative only. Add Supabase credentials to enable secure accounts and persistence.</p></div></div><div className="flex shrink-0 gap-1 rounded-xl border border-amber-200 bg-white p-1"><button onClick={() => setPreviewRole("friend")} className={"rounded-lg px-3 py-1.5 text-xs font-semibold " + (role === "friend" ? "bg-forest text-white" : "text-muted hover:bg-cream")}>Friend view</button><button onClick={() => setPreviewRole("admin")} className={"rounded-lg px-3 py-1.5 text-xs font-semibold " + (role === "admin" ? "bg-forest text-white" : "text-muted hover:bg-cream")}>Admin view</button></div></div>}
          {supabaseConfigured && membership && <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sage/30 bg-sage-light/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-sage-dark" /><div><p className="text-sm font-semibold text-forest">Account connected · Milestone 1</p><p className="mt-0.5 text-xs leading-5 text-muted">Authentication and membership are connected. Schedule, message and notification data wiring comes next; this screen does not send reminders yet.</p></div></div>{role === "admin" && <button onClick={handleCreateInvite} disabled={busy} className="button-secondary shrink-0"><Plus size={15} /> Invite friend</button>}</div>}
          {inviteUrl && <div className="mb-6 rounded-2xl border border-line bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} /> Private invitation link</div><p className="mt-1 text-xs text-muted">Share this only with your friend. It expires after 7 days and can be used once.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly value={inviteUrl} className="min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 py-2 text-xs text-forest" /><button className="button-secondary" onClick={() => { void navigator.clipboard.writeText(inviteUrl).then(() => setNotice("Invitation link copied.")).catch(() => setError("Clipboard access was blocked. Select and copy the link manually.")); }}><Copy size={15} /> Copy link</button></div></div>}
          <div className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div className="max-w-2xl"><div className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-sage" /> A LITTLE CARE, THROUGHOUT THE DAY</div><h1 className="mt-4 font-display text-4xl font-medium leading-tight tracking-[-.045em] text-forest sm:text-5xl">{copy.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">{copy.subtitle}</p></div><div className="flex items-center gap-2"><div className="flex -space-x-2"><div className="avatar-soft ring-2 ring-cream">♡</div><div className="avatar-olive ring-2 ring-cream"><Heart size={15} /></div></div><div className="ml-1"><div className="text-xs font-semibold">{isPreview ? "Care, together" : role === "admin" ? "Care coordinator" : "Your care space"}</div><div className="mt-0.5 text-[11px] text-muted">{isPreview ? "A private space for two" : membership?.care_spaces?.timezone ?? localTimezone()}</div></div></div></div>
          {view === "today" && <TodayView isPreview={isPreview} role={role} completed={completed} setCompleted={setCompleted} onNavigate={setView} />}
          {view === "schedule" && <FeaturePanel icon={<CalendarDays size={21} />} title="Your schedule" description="Personal routines and shared plans belong here. Shared routines become active only after your friend approves them." isPreview={isPreview} />}
          {view === "messages" && <FeaturePanel icon={<MessageCircle size={21} />} title="Messages, made personal" description="Custom messages and a shared sender–recipient history will be connected in the next milestone. No messages are sent from this preview." isPreview={isPreview} />}
          {view === "checkin" && <FeaturePanel icon={<Heart size={21} />} title="A gentle daily check-in" description="Mood and energy summaries can be shared by choice. Free-text check-in notes remain private." isPreview={isPreview} />}
          {view === "journal" && <FeaturePanel icon={<BookHeart size={21} />} title="Your private journal" description="Journal entries are private to their author by default and never appear in shared reports." isPreview={isPreview} />}
          {view === "reports" && <FeaturePanel icon={<BarChart3 size={21} />} title="Progress without pressure" description="Reports will include only the fields your friend has agreed to share. Private notes are excluded." isPreview={isPreview} />}
          {view === "settings" && <SettingsPanel isPreview={isPreview} pushStatus={pushStatus} onEnablePush={handleEnablePush} pushBusy={notificationBusy} />}
        </div>
      </main>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <div className="min-h-screen grid place-items-center bg-cream text-forest"><div className="flex items-center gap-3"><span className="loading-dot" /><span className="text-sm font-medium">{label}</span></div></div>;
}
function AuthScreen(props: {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  fullName: string;
  setFullName: (value: string) => void;
  mode: "signin" | "signup";
  setMode: (value: "signin" | "signup") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
}) {
  const signingUp = props.mode === "signup";
  return <div className="min-h-screen bg-cream p-4 sm:p-8"><div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-line bg-white shadow-soft lg:grid-cols-[1.02fr_.98fr]">
    <div className="relative flex flex-col justify-between overflow-hidden bg-forest p-7 text-white sm:p-10 lg:p-12"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" /><div className="relative flex items-center gap-3"><div className="brand-mark brand-mark-dark"><HeartHandshake size={22} /></div><div className="font-display text-xl font-semibold">Are You OK?<span className="text-[#b4c9a9]"></span></div></div><div className="relative my-12 max-w-md"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80"><Heart size={13} /> A little care, throughout the day</div><h1 className="font-display text-4xl font-medium leading-tight tracking-[-.04em] sm:text-5xl">Care that feels like someone is there.</h1><p className="mt-5 max-w-sm text-sm leading-7 text-white/65">A private space for routines, thoughtful reminders and small check-ins — always with consent, never with pressure.</p></div><div className="relative flex items-center gap-3 text-xs text-white/60"><ShieldCheck size={15} /> Private by design. Shared by choice.</div></div>
    <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14"><div className="mb-8"><div className="eyebrow"><LockKeyhole size={13} /> YOUR PRIVATE SPACE</div><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-forest">{signingUp ? "Create your account." : "Welcome back."}</h2><p className="mt-2 text-sm leading-6 text-muted">{signingUp ? "Create a profile to get started. Your account receives its own secure ID automatically." : "Sign in with your username and password."}</p></div>
      <form onSubmit={props.onSubmit} className="space-y-4">
        {<label className="block"><span className="mb-2 block text-xs font-semibold text-forest">{signingUp ? "Choose a username" : "Username"}</span><input type="text" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9._-]+" title="Use 3–24 letters, numbers, dots, underscores or hyphens." value={props.username || props.fullName} onChange={(event) => { props.setUsername(event.target.value); if (signingUp) props.setFullName(event.target.value); }} placeholder="e.g. aryan_08" className="form-input" /></label>}
        <label className="block"><span className="mb-2 block text-xs font-semibold text-forest">Password</span><input type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={props.password} onChange={(event) => props.setPassword(event.target.value)} placeholder={signingUp ? "At least 8 characters" : "Your password"} className="form-input" /></label>
        <button disabled={props.busy} className="button-primary w-full justify-center" type="submit">{props.busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"} <ArrowRight size={16} /></button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">{signingUp ? "Already have an account?" : "New to Are You OK?"} <button type="button" className="font-semibold text-forest underline underline-offset-4" onClick={() => props.setMode(signingUp ? "signin" : "signup")}>{signingUp ? "Sign in" : "Create an account"}</button></p>
      <p className="mt-4 text-center text-xs leading-5 text-muted">No email address is required. Choose a unique username and keep your password safe. Your private notes stay private, and shared care data requires consent.</p>
      {props.error && <div className="mt-4"><InlineNotice kind="error" text={props.error} onClose={() => undefined} /></div>}
      <div className="mt-8 flex items-center gap-3 text-xs text-muted"><div className="h-px flex-1 bg-line" /> Private by default <div className="h-px flex-1 bg-line" /></div></div>
  </div></div>;
}
function InvitationConsentScreen(props: {
  busy: boolean;
  error: string;
  onAccept: (scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean }) => void;
  onDecline: () => void;
}) {
  const [sharedSchedules, setSharedSchedules] = useState(false);
  const [messageHistory, setMessageHistory] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  return <div className="min-h-screen bg-cream px-4 py-10"><section className="mx-auto max-w-2xl rounded-[2rem] border border-line bg-white p-7 shadow-soft sm:p-10">
    <div className="brand-mark"><HeartHandshake size={22} /></div>
    <div className="eyebrow mt-7"><LockKeyhole size={13} /> PRIVATE INVITATION</div>
    <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-forest">Join a care space?</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Before joining, choose what you're comfortable sharing. You can revoke consent later. Your journal and free-text check-in notes remain private.</p>
    <div className="mt-7 space-y-3">
      <label className="flex gap-3 rounded-2xl border border-line p-4"><input type="checkbox" checked={sharedSchedules} onChange={(e) => setSharedSchedules(e.target.checked)} className="mt-1 accent-[#4d7156]" /><span><span className="block text-sm font-semibold">Shared schedules <span className="text-terracotta">*</span></span><span className="mt-1 block text-xs leading-5 text-muted">Allow the two of you to propose and review shared routines. Personal schedules remain yours.</span></span></label>
      <label className="flex gap-3 rounded-2xl border border-line p-4"><input type="checkbox" checked={messageHistory} onChange={(e) => setMessageHistory(e.target.checked)} className="mt-1 accent-[#4d7156]" /><span><span className="block text-sm font-semibold">Message history <span className="text-terracotta">*</span></span><span className="mt-1 block text-xs leading-5 text-muted">Messages are visible to the sender and intended recipient.</span></span></label>
      <label className="flex gap-3 rounded-2xl border border-line p-4"><input type="checkbox" checked={dailySummary} onChange={(e) => setDailySummary(e.target.checked)} className="mt-1 accent-[#4d7156]" /><span><span className="block text-sm font-semibold">Share daily check-in summaries (optional)</span><span className="mt-1 block text-xs leading-5 text-muted">Share selected mood and energy fields. Free-text notes and journal entries are never included.</span></span></label>
    </div>
    <p className="mt-4 text-xs leading-5 text-muted">The invite expires after 7 days and can be used once. Joining does not enable browser notifications automatically.</p>
    {props.error && <InlineNotice kind="error" text={props.error} onClose={() => undefined} />}
    <button disabled={props.busy || !sharedSchedules || !messageHistory} className="button-primary mt-5 w-full justify-center" onClick={() => props.onAccept({ shared_schedules: sharedSchedules, message_history: messageHistory, daily_summary: dailySummary })}>{props.busy ? "Joining…" : "Accept and join"} <ArrowRight size={16} /></button>
    <button disabled={props.busy} className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-cream" onClick={props.onDecline}>Not now</button>
  </section></div>;
}

function OnboardingScreen(props: { email: string; name: string; setName: (value: string) => void; onCreate: (event: FormEvent<HTMLFormElement>, scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean }) => void; busy: boolean; error: string; onSignOut: () => void }) {
  const [sharedSchedules, setSharedSchedules] = useState(false);
  const [messageHistory, setMessageHistory] = useState(false);
  return <div className="min-h-screen bg-cream px-4 py-10"><div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-7 shadow-soft sm:p-10"><div className="brand-mark"><HeartHandshake size={22} /></div><div className="eyebrow mt-7"><Leaf size={13} /> A PRIVATE SPACE FOR TWO</div><h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-forest">Let's make room for care.</h1><p className="mt-3 text-sm leading-6 text-muted">Signed in as {props.email}. Create a private care space, or open the invitation link your friend shared with you.</p><form className="mt-7 space-y-4" onSubmit={(event) => props.onCreate(event, { shared_schedules: sharedSchedules, daily_summary: false, message_history: messageHistory })}><label className="block"><span className="mb-2 block text-xs font-semibold text-forest">Care space name</span><input required maxLength={80} value={props.name} onChange={(event) => props.setName(event.target.value)} className="form-input" /></label><div className="rounded-xl bg-cream p-3 text-xs leading-5 text-muted"><Clock3 size={14} className="mr-1 inline" /> Your local timezone ({localTimezone()}) will be used for future schedules. Quiet hours default to 11 PM–7 AM.</div><label className="flex gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={sharedSchedules} onChange={(event) => setSharedSchedules(event.target.checked)} className="mt-1 accent-[#4d7156]" /><span className="text-xs leading-5"><strong className="text-forest">Shared schedules</strong><span className="block text-muted">I agree to propose shared routines that my friend can approve or decline.</span></span></label><label className="flex gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={messageHistory} onChange={(event) => setMessageHistory(event.target.checked)} className="mt-1 accent-[#4d7156]" /><span className="text-xs leading-5"><strong className="text-forest">Message history</strong><span className="block text-muted">I understand messages are visible to their sender and intended recipient.</span></span></label><button disabled={props.busy || !sharedSchedules || !messageHistory} className="button-primary w-full justify-center" type="submit">{props.busy ? "Creating…" : "Create my care space"} <ArrowRight size={16} /></button></form><button className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-cream" onClick={props.onSignOut}>Sign out</button>{props.error && <InlineNotice kind="error" text={props.error} onClose={() => undefined} />}</div></div>;
}
function TodayView(props: { isPreview: boolean; role: CareRole; completed: string[]; setCompleted: (update: (old: string[]) => string[]) => void; onNavigate: (view: View) => void }) {
  const doneCount = props.completed.length;
  return <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]"><div className="space-y-5">
    <section className="hero-card relative overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-8"><div className="absolute -right-10 -top-12 h-64 w-64 rounded-full border border-white/10" /><div className="relative flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-medium text-white/65"><Sun size={14} /> A softer start</div><h2 className="mt-4 max-w-lg font-display text-3xl font-medium leading-tight tracking-[-.035em] sm:text-4xl">You're doing better than you think.</h2><p className="mt-3 max-w-md text-sm leading-6 text-white/70">You deserve the same kindness you give to everyone else. Let's take today one step at a time.</p></div><div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 sm:flex"><Sparkles size={24} /></div></div><div className="relative mt-7 flex flex-wrap items-center gap-3"><button className="button-light" onClick={() => props.onNavigate("checkin")}>How are you feeling? <ArrowRight size={15} /></button><span className="text-xs text-white/55">No pressure. Just a moment for you.</span></div></section>
    <section className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h2 className="font-display text-xl font-semibold tracking-tight">Today's little steps</h2><span className="rounded-full bg-sage-light px-2 py-1 text-[10px] font-semibold text-sage-dark">{props.isPreview ? doneCount + "/" + previewTasks.length : "Not connected"}</span></div><p className="mt-1 text-xs text-muted">Every small step counts. There is no perfect score.</p></div><button className="button-quiet" onClick={() => props.onNavigate("schedule")}>View schedule <ChevronRight size={15} /></button></div>{props.isPreview ? (
            <div className="mt-5 space-y-2.5">
              {previewTasks.map((task) => {
                const Icon = task.icon;
                const isDone = props.completed.includes(task.id);
                return <div key={task.id} className={"task-row " + (isDone ? "task-row-done" : "")}>
                  <button aria-label={isDone ? "Mark " + task.title + " incomplete" : "Mark " + task.title + " complete"} onClick={() => props.setCompleted((old) => isDone ? old.filter((id) => id !== task.id) : [...old, task.id])} className={"task-check " + (isDone ? "task-check-done" : "")}>{isDone && <Check size={15} />}</button>
                  <div className={"task-icon task-icon-" + task.tone}><Icon size={19} strokeWidth={1.8} /></div>
                  <div className="min-w-0 flex-1"><div className={"text-sm font-semibold " + (isDone ? "text-muted line-through" : "text-forest")}>{task.title}</div><div className="mt-1 text-xs leading-5 text-muted">{task.detail}</div></div>
                  <div className="hidden items-center gap-1.5 text-xs font-medium text-muted sm:flex"><Clock3 size={13} /> {task.time}</div>
                </div>;
              })}
              <p className="mt-4 text-[11px] text-muted">Illustrative sample tasks only — not saved or sent to anyone.</p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-line bg-cream p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} /> Your real schedule is not connected yet</div>
              <p className="mt-2 text-xs leading-5 text-muted">Milestone 1 establishes authentication and privacy boundaries. Real tasks will appear here after schedule persistence is implemented.</p>
            </div>
          )}</section>
    <section className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold tracking-tight">A note to keep close</h2><p className="mt-1 text-xs text-muted">A little reminder for the heart.</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-peach text-terracotta"><Heart size={18} /></div></div><p className="mt-4 font-display text-xl italic leading-relaxed text-forest">“You don't have to earn rest. You are allowed to take care of yourself, even on the days when everything feels difficult.”</p><div className="mt-4 text-[10px] font-semibold uppercase tracking-[.15em] text-muted">A GENTLE REMINDER · NOT A TASK</div></section>
  </div><div className="space-y-5">
    <section className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-semibold">A moment for you</h2><p className="mt-1 text-xs text-muted">How is today feeling?</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lilac text-[#74668d]"><HeartHandshake size={19} /></div></div><div className="mt-5 grid grid-cols-3 gap-2">{[{label:"Okay",face:"☺"},{label:"Tired",face:"☁"},{label:"Heavy",face:"♡"}].map((mood) => <button key={mood.label} onClick={() => props.onNavigate("checkin")} className="mood-button"><span className="font-display text-2xl">{mood.face}</span><span className="mt-1 text-xs font-medium">{mood.label}</span></button>)}</div><button className="button-secondary mt-4 w-full justify-center" onClick={() => props.onNavigate("checkin")}>Check in with yourself <ArrowRight size={15} /></button></section>
    <section className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-semibold">A message for you</h2><p className="mt-1 text-xs text-muted">{props.role === "admin" ? "A message you could send" : "A little note from someone who cares"}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-dark"><MessageCircle size={19} /></div></div>{props.isPreview ? <div className="mt-4 rounded-2xl bg-cream p-4"><div className="flex items-center gap-2 text-xs font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sage-dark"><Heart size={13} /></span>{props.role === "admin" ? "Your message draft" : "Someone who cares"}</div><p className="mt-3 text-sm leading-6 text-muted">Hey, just checking in. Have you had something to eat and taken a little time for yourself? No pressure — I'm here if you need me. 💚</p><p className="mt-3 text-[11px] text-muted">Illustrative copy only. Not sent or stored.</p></div> : <div className="mt-4 rounded-2xl border border-dashed border-line bg-cream p-4"><p className="text-sm font-semibold">No connected messages yet</p><p className="mt-2 text-xs leading-5 text-muted">The message studio and persisted conversation history will be wired in the next milestone.</p></div>}<button className="button-secondary mt-3 w-full justify-center" onClick={() => props.onNavigate("messages")}>{props.role === "admin" ? "Open message studio" : "View messages"} <ArrowRight size={15} /></button>{props.isPreview && <p className="mt-3 text-[11px] text-muted">Sample copy only. This doesn't send a notification.</p>}</section>
    <section className="rounded-[1.5rem] border border-sage/25 bg-sage-light/55 p-5"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-sage-dark" /> Your space, your choice</div><p className="mt-2 text-xs leading-5 text-muted">Shared summaries are optional. Your journal and private notes stay yours.</p><button className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sage-dark hover:underline" onClick={() => props.onNavigate("settings")}>Review privacy settings <ArrowRight size={13} /></button></section>
  </div></div>;
}
function FeaturePanel(props: { icon: ReactNode; title: string; description: string; isPreview: boolean }) {
  return <section className="mx-auto max-w-3xl rounded-[1.75rem] border border-line bg-white p-7 sm:p-10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-light text-sage-dark">{props.icon}</div><h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">{props.title}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">{props.description}</p><div className="mt-7 rounded-2xl border border-dashed border-line bg-cream p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} /> {props.isPreview ? "Preview only" : "Next implementation milestone"}</div><p className="mt-2 text-xs leading-5 text-muted">{props.isPreview ? "This section is a design preview. Actions will not persist or send notifications." : "This feature is not connected to live care data yet. No real reminder or message is being sent from this screen."}</p></div></section>;
}
function SettingsPanel({ isPreview, pushStatus, onEnablePush, pushBusy }: { isPreview: boolean; pushStatus: string; onEnablePush: () => void; pushBusy: boolean }) {
  const settings = [
    { icon: <Activity size={17} />, title: "Care activity", detail: "Changes to shared routines and permissions are auditable." },
    { icon: <LockKeyhole size={17} />, title: "Private by default", detail: "Your journal and free-text notes are not shared." },
    { icon: <Moon size={17} />, title: "Quiet hours", detail: "11:00 PM to 7:00 AM in your configured timezone." },
    { icon: <Clock3 size={17} />, title: "History retention", detail: "Eligible historical records are removed after 90 days." },
    { icon: <Bell size={17} />, title: "Browser notifications", detail: "In-app notification centre is connected. Push needs browser permission and a public VAPID key; background delivery also needs a server-side sender." },
  ];
  return <section className="mx-auto max-w-3xl rounded-[1.75rem] border border-line bg-white p-6 sm:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-light text-sage-dark"><ShieldCheck size={22} /></div><h2 className="mt-5 font-display text-2xl font-semibold">Your care, your choices.</h2><p className="mt-2 text-sm leading-6 text-muted">The finalized product uses consent-based sharing, private journal entries and a 90-day default history retention policy.</p><div className="mt-6 space-y-3">{settings.map((item) => <div key={item.title} className="flex items-start gap-3 rounded-2xl bg-cream p-4"><div className="mt-0.5 text-sage-dark">{item.icon}</div><div><div className="text-sm font-semibold">{item.title}</div><p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p></div></div>)}</div><div className="mt-5 rounded-2xl border border-line bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} /> Browser push</div><p className="mt-2 text-xs leading-5 text-muted">{pushStatus}. The in-app notification centre works independently as a fallback.</p><button disabled={isPreview || pushBusy} onClick={onEnablePush} className="button-secondary mt-3 w-full justify-center">{pushBusy ? "Setting up…" : "Enable notifications on this device"}</button></div>{isPreview && <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Preview mode: preferences shown here are design defaults and are not saved.</div>}</section>;
}
function InlineNotice(props: { kind: "success" | "error"; text: string; onClose: () => void }) {
  return <div role={props.kind === "error" ? "alert" : "status"} className={"mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm " + (props.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-sage/30 bg-sage-light/70 text-forest")}><div className="mt-0.5">{props.kind === "error" ? <CircleHelp size={16} /> : <CheckCircle2 size={16} />}</div><p className="min-w-0 flex-1 leading-5">{props.text}</p><button aria-label="Dismiss message" onClick={props.onClose} className="rounded-md p-0.5 opacity-70 hover:opacity-100"><X size={14} /></button></div>;
}
