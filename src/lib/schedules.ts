import { supabase } from "./supabase";

export type ScheduleType = "meal" | "hydration" | "medicine" | "rest" | "task" | "check_in";
export type ScheduleScope = "personal" | "shared";
export interface CareSchedule {
  id: string; care_space_id: string; owner_user_id: string | null; created_by: string;
  scope: ScheduleScope; type: ScheduleType; title: string; instructions: string | null;
  local_time: string | null; timezone: string; recurrence_rule: Record<string, unknown>;
  status: "proposed" | "active" | "paused" | "declined" | "archived"; version: number;
  created_at: string; updated_at: string;
}
export interface ScheduleOccurrence { id: string; schedule_id: string; scheduled_for: string; status: "pending" | "completed" | "skipped" | "cancelled"; snoozed_until: string | null; }
function client() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }

export async function listCareSchedules(careSpaceId: string): Promise<CareSchedule[]> {
  const db = client();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to view schedules.");
  const { data, error } = await db.from("care_schedules").select("*").eq("care_space_id", careSpaceId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as CareSchedule[];
}
export async function createCareSchedule(input: {
  careSpaceId: string; scope: ScheduleScope; type: ScheduleType; title: string;
  instructions: string; scheduledFor: string; timezone: string; recurrence: "once" | "daily" | "weekly";
}): Promise<string> {
  const db = client();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to create a schedule.");
  const scheduled = new Date(input.scheduledFor);
  if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
  const { data, error } = await db.rpc("create_schedule_with_reminder", {
    p_care_space_id: input.careSpaceId, p_scope: input.scope, p_type: input.type,
    p_title: input.title.trim(), p_instructions: input.instructions.trim(),
    p_scheduled_for: scheduled.toISOString(), p_timezone: input.timezone,
    p_recurrence_rule: { frequency: input.recurrence },
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Schedule creation did not return an ID.");
  return data;
}
export async function reviewCareSchedule(id: string, decision: "approved" | "declined" | "revision_requested", note = ""): Promise<void> {
  const { error } = await client().rpc("review_shared_schedule", { p_schedule_id: id, p_decision: decision, p_note: note });
  if (error) throw error;
}
export async function updatePersonalSchedule(id: string, status: "active" | "paused" | "archived"): Promise<void> {
  const db = client();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to update schedules.");
  const { error } = await db.from("care_schedules").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", auth.user.id).eq("scope", "personal");
  if (error) throw error;
}
export async function listScheduleOccurrences(scheduleIds: string[]): Promise<ScheduleOccurrence[]> {
  if (!scheduleIds.length) return [];
  const { data, error } = await client().from("task_occurrences").select("id,schedule_id,scheduled_for,status,snoozed_until").in("schedule_id", scheduleIds).order("scheduled_for", { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []) as ScheduleOccurrence[];
}

export async function completeOccurrence(id: string): Promise<void> { const {error}=await client().rpc("complete_task_occurrence",{p_occurrence_id:id}); if(error)throw error; }
export async function snoozeOccurrence(id: string): Promise<string> { const {data,error}=await client().rpc("snooze_task_occurrence",{p_occurrence_id:id}); if(error)throw error; return String(data); }
