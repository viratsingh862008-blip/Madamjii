import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY")||"",vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY")||"",vapidSubject=Deno.env.get("VAPID_SUBJECT")||"mailto:admin@areyouok.app";
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
if(vapidPublic&&vapidPrivate)webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);
function parts(date:Date,tz:string){const p=new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);return {h:Number(p.find(x=>x.type==="hour")?.value||0),m:Number(p.find(x=>x.type==="minute")?.value||0)}}
function quiet(date:Date,tz:string,start:string,end:string){const p=parts(date,tz),n=p.h*60+p.m,[sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number),s=sh*60+sm,e=eh*60+em;return s===e?false:s<e?n>=s&&n<e:n>=s||n<e}
function nextEnd(date:Date,tz:string,end:string){const [eh,em]=end.split(":").map(Number),p=parts(date,tz);let delta=(eh*60+em)-(p.h*60+p.m);if(delta<=0)delta+=1440;return new Date(date.getTime()+delta*60000)}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"POST required"}),{status:405,headers:cors});
 // Only a trusted server-side scheduler holding the service-role key may invoke this worker.
 if(req.headers.get("authorization")!==`Bearer ${serviceKey}`)return new Response(JSON.stringify({error:"Server scheduler authorization required"}),{status:403,headers:cors});
 try{
  const {data:generated,error:ge}=await db.rpc("generate_recurring_occurrences",{p_limit:100});if(ge)throw ge;
  const {data:jobs,error:je}=await db.rpc("claim_due_reminder_jobs",{p_limit:25});if(je)throw je;
  let dispatched=0,deferred=0,failed=0,pushSent=0,pushSkipped=0;
  for(const job of jobs??[]){
   try{
    let occurrence:any=null,schedule:any=null,message:any=null;
    if(job.occurrence_id){
     const {data,error}=await db.from("task_occurrences").select("id,scheduled_for,status,follow_up_consumed_at,schedule_id").eq("id",job.occurrence_id).maybeSingle();if(error)throw error;occurrence=data;
     if(occurrence){const {data:s,error:se}=await db.from("care_schedules").select("id,title,instructions,care_space_id,timezone,status,owner_user_id,scope,recurrence_rule").eq("id",occurrence.schedule_id).maybeSingle();if(se)throw se;schedule=s;}
    }
    if(job.message_id){const {data,error}=await db.from("care_messages").select("id,body,sender_user_id,recipient_user_id,care_space_id,status,scheduled_at").eq("id",job.message_id).maybeSingle();if(error)throw error;message=data;}
    if(job.occurrence_id&&!occurrence){await db.rpc("finish_reminder_job",{p_job_id:job.id,p_result:"permanent_failure",p_error_code:"occurrence_missing"});failed++;continue;}
    if(occurrence&&occurrence.status!=="pending"){await db.rpc("finish_reminder_job",{p_job_id:job.id,p_result:"cancelled",p_error_code:"occurrence_not_pending"});continue;}
    if(schedule&&schedule.status!=="active"){await db.rpc("finish_reminder_job",{p_job_id:job.id,p_result:"cancelled",p_error_code:"schedule_not_active"});continue;}
    let timezone=schedule?.timezone||"Asia/Kolkata",start="23:00",end="07:00";
    if(schedule){const {data:prefs,error:pe}=await db.from("member_preferences").select("timezone,quiet_hours_start,quiet_hours_end").eq("care_space_id",schedule.care_space_id).eq("user_id",job.recipient_user_id).maybeSingle();if(pe)throw pe;if(prefs){timezone=prefs.timezone||timezone;start=String(prefs.quiet_hours_start||start).slice(0,5);end=String(prefs.quiet_hours_end||end).slice(0,5);}}
    if(quiet(new Date(),timezone,start,end)){const next=nextEnd(new Date(),timezone,end);await db.from("reminder_jobs").update({status:"queued",due_at:next.toISOString(),lease_expires_at:null}).eq("id",job.id);deferred++;continue;}
    const title=job.job_type==="follow_up"?"A gentle follow-up":message?"A message for you":schedule?.title||"A gentle reminder";
    const body=job.job_type==="follow_up"?"Just checking in. You can mark this complete or leave it for later.":message?.body||schedule?.instructions||"It's time for the routine you scheduled. No pressure.";
    const {error:inboxError}=await db.from("app_notifications").upsert({user_id:job.recipient_user_id,title,body,notification_type:"reminder",dedupe_key:"reminder:"+job.id,expires_at:new Date(Date.now()+90*86400000).toISOString()},{onConflict:"user_id,dedupe_key",ignoreDuplicates:true});if(inboxError)throw inboxError;
    const {data:subs,error:subError}=await db.from("browser_push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("user_id",job.recipient_user_id).eq("active",true);if(subError)throw subError;
    if(vapidPublic&&vapidPrivate&&(subs??[]).length){for(const sub of subs??[]){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},{title,body,tag:"reminder:"+job.id,data:{url:"/?notification="+encodeURIComponent(job.id)}},{TTL:60,urgency:"normal"});pushSent++;}catch(err){const status=Number((err as any)?.statusCode||0);if(status===404||status===410)await db.from("browser_push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);pushSkipped++;}}}else pushSkipped++;
    if(job.job_type==="initial" && occurrence && occurrence.follow_up_consumed_at===null) {
      const {data:claimed,error:claimError}=await db.from("task_occurrences").update({follow_up_consumed_at:new Date().toISOString()}).eq("id",occurrence.id).is("follow_up_consumed_at",null).eq("status","pending").select("id").maybeSingle();
      if(claimError) throw claimError;
      if(claimed) {
        const {error:followError}=await db.from("reminder_jobs").insert({occurrence_id:occurrence.id,recipient_user_id:job.recipient_user_id,job_type:"follow_up",due_at:new Date(Date.now()+30*60000).toISOString(),status:"queued",idempotency_key:"occurrence:"+occurrence.id+":follow_up"});
        if(followError && !String(followError.message).includes("duplicate")) throw followError;
      }
    }
    await db.rpc("finish_reminder_job",{p_job_id:job.id,p_result:"dispatched",p_error_code:pushSkipped?"in_app_fallback_or_push_partial":null});dispatched++;
   }catch(err){await db.rpc("finish_reminder_job",{p_job_id:job.id,p_result:"temporary_failure",p_error_code:String((err as Error)?.message||"worker_error").slice(0,120)});failed++;}
  }
  const now=new Date();let retention:any=null;
  if(now.getUTCHours()===3&&now.getUTCMinutes()<10){const {data,error}=await db.rpc("run_retention_cleanup");if(!error)retention=data;}
  return new Response(JSON.stringify({ok:true,generated:generated??0,claimed:(jobs??[]).length,dispatched,deferred,failed,pushSent,pushSkipped,retention}),{headers:cors});
 }catch(err){return new Response(JSON.stringify({error:String((err as Error)?.message||"worker_failed")}),{status:500,headers:cors});}
});
