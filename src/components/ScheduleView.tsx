import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, LoaderCircle, Pause, Plus, ShieldCheck, X } from "lucide-react";
import { completeOccurrence, createCareSchedule, listCareSchedules, listScheduleOccurrences, reviewCareSchedule, snoozeOccurrence, updatePersonalSchedule, type CareSchedule, type ScheduleOccurrence, type ScheduleScope, type ScheduleType } from "../lib/schedules";

const types: { value: ScheduleType; label: string }[] = [
  { value: "task", label: "Task / routine" }, { value: "meal", label: "Meal" },
  { value: "hydration", label: "Hydration" }, { value: "medicine", label: "Medicine" },
  { value: "rest", label: "Rest" }, { value: "check_in", label: "Check-in" },
];
function futureLocalInput() { const date = new Date(Date.now() + 60 * 60 * 1000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0,16); }
export default function ScheduleView(props: { careSpaceId: string; role: "admin" | "friend"; timezone: string; isPreview: boolean; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<CareSchedule[]>([]);
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [type, setType] = useState<ScheduleType>("task");
  const [scope, setScope] = useState<ScheduleScope>("personal");
  const [when, setWhen] = useState(futureLocalInput);
  const [filter, setFilter] = useState<"all" | "personal" | "shared">("all");\n  const [recurrence, setRecurrence] = useState<"once" | "daily" | "weekly">("once");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const schedules = await listCareSchedules(props.careSpaceId);
      setItems(schedules);
      setOccurrences(await listScheduleOccurrences(schedules.map(item => item.id)));
    } catch (e) { props.onError(e instanceof Error ? e.message : "Couldn't load schedules."); }
    finally { setLoading(false); }
  }, [props.careSpaceId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await createCareSchedule({ careSpaceId: props.careSpaceId, scope, type, title, instructions, scheduledFor: when, timezone: props.timezone, recurrence });
      setShowForm(false); setTitle(""); setInstructions(""); setWhen(futureLocalInput());
      props.onNotice(scope === "shared" ? "Shared schedule proposed. Your friend must approve it before it becomes active." : "Schedule saved. Its reminder is queued; delivery starts after the notification worker is enabled.");
      await refresh();
    } catch (e) { props.onError(e instanceof Error ? e.message : "Couldn't create schedule."); }
    finally { setSaving(false); }
  }
  async function review(item: CareSchedule, decision: "approved" | "declined") {
    setSaving(true);
    try { await reviewCareSchedule(item.id, decision); props.onNotice(decision === "approved" ? "Shared schedule approved." : "Shared schedule declined."); await refresh(); }
    catch (e) { props.onError(e instanceof Error ? e.message : "Couldn't review schedule."); }
    finally { setSaving(false); }
  }
  async function changeStatus(item: CareSchedule, status: "active" | "paused" | "archived") {
    setSaving(true);
    try { await updatePersonalSchedule(item.id, status); props.onNotice(status === "archived" ? "Schedule archived." : status === "paused" ? "Schedule paused." : "Schedule resumed."); await refresh(); }
    catch (e) { props.onError(e instanceof Error ? e.message : "Couldn't update schedule."); }
    finally { setSaving(false); }
  }
  const visible = items.filter(item => filter === "all" || item.scope === filter);
  const occurrenceBySchedule = new Map(occurrences.map(o => [o.schedule_id, o]));
  return <div className="space-y-5">
    <section className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="eyebrow"><CalendarDays size={13}/> SCHEDULE CONTROL</div><h2 className="mt-3 font-display text-2xl font-semibold">Schedules & reminders</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Create a one-time routine, manage personal schedules, and propose shared plans for friend approval. Times use {props.timezone}.</p></div><button className="button-primary shrink-0" onClick={() => setShowForm(v=>!v)}><Plus size={16}/>{showForm ? "Close form" : "Create schedule"}</button></div>
      {showForm && <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-line bg-cream p-4 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block text-xs font-semibold">Schedule title</span><input className="form-input" required minLength={1} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Evening check-in"/></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold">Category</span><select className="form-input" value={type} onChange={e=>setType(e.target.value as ScheduleType)}>{types.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold">Date and time (your device timezone)</span><input className="form-input" type="datetime-local" required min={futureLocalInput()} value={when} onChange={e=>setWhen(e.target.value)}/></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold">Repeat</span><select className="form-input" value={recurrence} onChange={e=>setRecurrence(e.target.value as "once"|"daily"|"weekly")}><option value="once">One time</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></label>\n        <label className="block"><span className="mb-2 block text-xs font-semibold">Who is this for?</span><select className="form-input" value={scope} onChange={e=>setScope(e.target.value as ScheduleScope)}><option value="personal">Personal (private)</option>{props.role === "admin" && <option value="shared">Shared (friend must approve)</option>}</select></label>
        <label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold">Notes / instructions (optional)</span><textarea className="form-input min-h-24" maxLength={1000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Gentle context or instructions. For medicine, follow the prescriber's directions." /></label>
        <div className="sm:col-span-2 rounded-xl border border-sage/30 bg-white p-3 text-xs leading-5 text-muted"><Clock3 size={14} className="mr-1 inline"/> {recurrence==="once"?"Creates one reminder occurrence.":"Creates the first occurrence and records "+recurrence+" recurrence for the background generator."} Reminder delivery still depends on the server worker being invoked.</div>
        <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="button-primary" type="submit">{saving ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>} Save schedule</button><button type="button" className="button-secondary" onClick={()=>setShowForm(false)}>Cancel</button></div>
      </form>}
      <div className="mt-5 flex flex-wrap gap-2">{(["all","personal","shared"] as const).map(f=><button key={f} className={filter===f?"button-primary":"button-secondary"} onClick={()=>setFilter(f)}>{f==="all"?"All schedules":f==="personal"?"Personal":"Shared"}</button>)}</div>
      {loading ? <div className="flex items-center gap-2 py-10 text-sm text-muted"><LoaderCircle size={17} className="animate-spin"/> Loading schedules…</div> : visible.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-line bg-cream p-7 text-center"><CalendarDays className="mx-auto text-sage-dark" size={25}/><p className="mt-3 text-sm font-semibold">No schedules here yet</p><p className="mt-1 text-xs text-muted">Create your first schedule to start building a gentle routine.</p></div> : <div className="mt-4 space-y-3">{visible.map(item=>{const occurrence=occurrenceBySchedule.get(item.id); return <article key={item.id} className="rounded-2xl border border-line bg-white p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-sage-light px-2.5 py-1 text-[10px] font-semibold text-sage-dark">{item.scope==="shared"?"Shared":"Personal"}</span><span className="rounded-full bg-cream px-2.5 py-1 text-[10px] font-semibold text-muted">{item.status}</span><span className="text-[10px] text-muted">{types.find(t=>t.value===item.type)?.label ?? item.type}</span></div><h3 className="mt-3 text-base font-semibold">{item.title}</h3>{item.instructions && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{item.instructions}</p>}<p className="mt-3 text-xs text-muted"><Clock3 size={13} className="mr-1 inline"/>{occurrence ? new Date(occurrence.scheduled_for).toLocaleString() : item.local_time ? item.local_time.slice(0,5)+" · "+item.timezone : "No occurrence queued"}{occurrence ? " · "+occurrence.status : ""}</p></div><div className="flex flex-wrap gap-2">{occurrence && occurrence.status==="pending" && <><button disabled={saving} className="button-secondary" onClick={async()=>{setSaving(true);try{await completeOccurrence(occurrence.id);props.onNotice("Routine marked complete.");await refresh();}catch(e){props.onError(e instanceof Error?e.message:"Could not complete task.");}finally{setSaving(false);}}}><Check size={14}/> Done</button><button disabled={saving} className="button-secondary" onClick={async()=>{setSaving(true);try{await snoozeOccurrence(occurrence.id);props.onNotice("One five-minute follow-up was queued.");await refresh();}catch(e){props.onError(e instanceof Error?e.message:"Could not snooze task.");}finally{setSaving(false);}}}><Clock3 size={14}/> Snooze 5 min</button></>}{item.scope==="shared" && item.status==="proposed" && props.role==="friend" && <><button disabled={saving} className="button-primary" onClick={()=>void review(item,"approved")}><Check size={14}/> Approve</button><button disabled={saving} className="button-secondary" onClick={()=>void review(item,"declined")}><X size={14}/> Decline</button></>}{item.scope==="personal" && item.owner_user_id && <>{item.status==="active" ? <button disabled={saving} className="button-secondary" onClick={()=>void changeStatus(item,"paused")}><Pause size={14}/> Pause</button> : item.status==="paused" ? <button disabled={saving} className="button-secondary" onClick={()=>void changeStatus(item,"active")}><Check size={14}/> Resume</button> : null}<button disabled={saving} className="button-quiet" onClick={()=>void changeStatus(item,"archived")}>Archive</button></>}</div></div></article>})}</div>}
    </section>
    <section className="rounded-2xl border border-sage/25 bg-sage-light/55 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-sage-dark" size={18}/><div><p className="text-sm font-semibold">Admin controls & consent</p><p className="mt-1 text-xs leading-5 text-muted">{props.role==="admin"?"You can create private routines and propose shared schedules. Shared schedules stay pending until your friend explicitly approves them.":"You control whether a shared schedule becomes active. Approving a schedule is not medical advice or a promise that a notification will arrive."} Personal routines are visible only to their owner. Background delivery is not live until the free notification worker is deployed.</p></div></div></section>
  </div>;
}
