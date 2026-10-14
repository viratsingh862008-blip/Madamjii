import { supabase } from "./supabase";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  notification_type: "general" | "reminder" | "check_in" | "system";
  read_at: string | null;
  created_at: string;
}

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const client = requireClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to view notifications.");
  const { data, error } = await client.from("app_notifications")
    .select("id,title,body,notification_type,read_at,created_at")
    .eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function createTestNotification(): Promise<void> {
  const client = requireClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to create a test notification.");
  const { error } = await client.from("app_notifications").insert({
    user_id: auth.user.id,
    title: "Notifications are connected",
    body: "This is a private test notification. Real reminders will appear here once scheduling is enabled.",
    notification_type: "system",
    dedupe_key: `test:${auth.user.id}:${new Date().toISOString().slice(0, 16)}`,
  });
  if (error) throw error;
}

export async function markNotificationRead(id: string): Promise<void> {
  const client = requireClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to update notifications.");
  const { error } = await client.from("app_notifications").update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", auth.user.id);
  if (error) throw error;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function enableBrowserPush(): Promise<"enabled" | "unsupported" | "missing-key" | "denied"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidKey) return "missing-key";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const client = requireClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in before enabling browser notifications.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(vapidKey) as BufferSource,
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The browser returned an incomplete push subscription.");
  const { error } = await client.from("browser_push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    active: true,
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw error;
  return "enabled";
}

export async function disableBrowserPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  if (!supabase) return;
  const { error } = await supabase.from("browser_push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function showLocalNotification(notification: AppNotification): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (registration) {
    await registration.showNotification(notification.title, {
      body: notification.body,
      tag: notification.id,
      data: { url: "/?notification=" + encodeURIComponent(notification.id) },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
  } else {
    new Notification(notification.title, { body: notification.body, tag: notification.id });
  }
}
