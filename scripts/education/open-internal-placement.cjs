'use strict';
// PO authorization received in this conversation on 2026-11-13. No staff signature,
// historical source review, published score, or permission grant is manufactured.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { connect, ROOT, OUT } = require('./target.cjs');
const decisionId = 'PO_INTERNAL_20261113';
const sources = ['27107a91-0a38-4e7b-b6da-d659f68a7138', 'be3b7a9e-b047-473e-8741-d5511a017d72'];
const hashes = ['d9514271ad4566705f1173520a07faae0eb37b6ffb3cbb01dccb5f6e230b26b8', '5cd737a122b120acf64a8e40a9af0602de5b4644745f4f40534e8e71063996ba'];
const sha = b => createHash('sha256').update(b).digest('hex');
function wavSeconds(bytes) {
  if (bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE') throw Error('INVALID_WAV');
  let rate=0, size=0;
  for(let pos=12;pos+8<=bytes.length;){const n=bytes.readUInt32LE(pos+4), kind=bytes.toString('ascii',pos,pos+4);
    if(pos+8+n>bytes.length)throw Error('TRUNCATED_WAV');
    if(kind==='fmt ')rate=bytes.readUInt32LE(pos+16);
    if(kind==='data')size+=n;
    pos+=8+n+(n%2);
  }
  if(!rate||!size)throw Error('EMPTY_WAV');return size/rate;
}
(async()=>{
  const {db}=await connect(false);
  try {
    await db.query('SELECT pg_advisory_xact_lock(842030)');
    const rows=(await db.query('SELECT * FROM placement_source_versions WHERE id=ANY($1::uuid[])',[sources])).rows;
    if(rows.length!==2)throw Error('FULL_BANK_MISSING');
    const verified=[];const media=new Map();
    for(const id of sources){
      const v=rows.find(r=>r.id===id),s=v.snapshot;
      if(v.sourceHash!==hashes[sources.indexOf(id)] || s.allQuestionIds.length!==(v.mode==='LR'?200:219))throw Error('BANK_IDENTITY_CHANGED');
      const counts={};const durations=new Map();
      for(const g of s.groups){
        counts[g.skill]=(counts[g.skill]||0)+g.questions.length;
        for(const q of g.questions){
          if(!q.content?.trim())throw Error('EMPTY_QUESTION '+q.id);
          if(['LISTENING','READING'].includes(g.skill) && (q.options.length<3||q.options.filter(o=>o.isCorrect).length!==1))throw Error('ANSWER_KEY_INVALID '+q.id);
        }
        if(g.skill==='LISTENING'&&!g.stimuli.some(a=>a.type==='AUDIO'&&!a.isProtected))throw Error('LISTENING_AUDIO_MISSING '+g.id);
        for(const a of g.stimuli.filter(a=>a.type!=='TEXT'&&!a.isProtected)){
          if(!a.storageKey?.startsWith('authored/')||a.storageKey.includes('..'))throw Error('MEDIA_PATH_INVALID');
          const file=path.join(ROOT,'.local-storage/v2-wave01/dev-media',a.storageKey.slice(9));
          const b=fs.readFileSync(file),expected=v.provenance.assets.find(x=>x.id===a.id);
          if(!expected||sha(b)!==expected.sha256)throw Error('MEDIA_HASH_MISMATCH '+a.id);
          if(a.type==='AUDIO')durations.set(g.id,(durations.get(g.id)||0)+wavSeconds(b));
          else if(a.mimeType!=='image/png'||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('IMAGE_INVALID '+a.id);
          media.set(a.storageKey,{sha256:sha(b),bytes:b.length,type:a.type});
        }
      }
      if(counts.LISTENING!==100||counts.READING!==100||(v.mode==='FOUR_SKILLS'&&(counts.SPEAKING!==11||counts.WRITING!==8)))throw Error('BLUEPRINT_MISMATCH');
      const p=(await db.query(`SELECT * FROM placement_workflow_policies WHERE "sourceId"=$1 AND kind='SOURCE_TIMING' AND "approvedById" IS NOT NULL`,[id])).rows;
      if(p.length!==1)throw Error('BASE_TIMING_POLICY_REQUIRED');
      const timing={sourceHash:v.sourceHash,evidence:'PO internal release; source task preparation/response windows; Writing 1-5 share 480 seconds as 96 seconds per task; original audio duration reserved before response.',tasks:s.groups.filter(g=>['SPEAKING','WRITING'].includes(g.skill)).map(g=>({groupId:g.id,preparationSeconds:g.preparationSeconds||0,playbackSeconds:Math.ceil(durations.get(g.id)||0),responseSeconds:g.responseSeconds||(g.skill==='WRITING'?96:30),...(g.skill==='SPEAKING'?{uploadSeconds:120}:{})}))};
      verified.push({sourceId:id,sourceHash:v.sourceHash,mode:v.mode,counts,policyId:p[0].id,timing});
    }
    await db.query(`CREATE TABLE IF NOT EXISTS placement_internal_releases (
      "sourceId" UUID PRIMARY KEY REFERENCES placement_source_versions(id),
      "sourceHash" TEXT NOT NULL CHECK("sourceHash"~'^[a-f0-9]{64}$'),
      "policyId" UUID NOT NULL REFERENCES placement_workflow_policies(id),
      "decisionId" TEXT NOT NULL, decision JSONB NOT NULL, timing JSONB NOT NULL,
      "authorizedAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), active BOOLEAN NOT NULL DEFAULT true)`);
    const decision={authority:'PO_USER_CONFIRMATION',scope:'SMART_ENGLISH_INTERNAL_LOCALHOST',receivedOn:'2026-11-13',statement:'PO confirms existing 200 Listening/Reading questions, 19 Speaking/Writing tasks, images and audio may be used within Smart English V2 graduation project. Enable internal assessment at localhost only. Speaking/Writing require teacher grading and confirmation. No ETS examination or official TOEIC certification is claimed.',recordedBy:'Codex implementation of explicit user instruction',humanSignature:null};
    for(const v of verified){
      await db.query(`INSERT INTO placement_internal_releases ("sourceId","sourceHash","policyId","decisionId",decision,timing)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT ("sourceId") DO NOTHING`,[v.sourceId,v.sourceHash,v.policyId,decisionId,decision,v.timing]);
      const saved=(await db.query('SELECT "sourceHash",timing,decision FROM placement_internal_releases WHERE "sourceId"=$1',[v.sourceId])).rows[0];
      if(saved.sourceHash!==v.sourceHash||JSON.stringify(saved.timing.tasks)!==JSON.stringify(JSON.parse(JSON.stringify(v.timing.tasks)))){
        // JSONB object key order is not significant.
        if(saved.sourceHash!==v.sourceHash||sha(JSON.stringify(saved.timing.tasks.map(t=>[t.groupId,t.preparationSeconds,t.playbackSeconds,t.responseSeconds,t.uploadSeconds])))!==sha(JSON.stringify(v.timing.tasks.map(t=>[t.groupId,t.preparationSeconds,t.playbackSeconds,t.responseSeconds,t.uploadSeconds]))))throw Error('RELEASE_CONFLICT');
      }
    }
    let actor=(await db.query("SELECT pg_get_functiondef('w04b_actor(text)'::regprocedure) AS def")).rows[0].def;
    const old="AND s.expire>clock_timestamp() AND u.status='ACTIVE' AND u.email LIKE '%@example.invalid';";
    const replacement=`AND s.expire>clock_timestamp() AND u.status='ACTIVE' AND (u.email LIKE '%@example.invalid' OR
      (current_setting('app.placement_internal_release',true)='${decisionId}' AND EXISTS(
        SELECT 1 FROM placement_internal_releases WHERE "decisionId"='${decisionId}' AND active=true)));
 IF current_setting('app.placement_internal_release',true)='${decisionId}' THEN PERFORM br136_bank_check.assert_target(); END IF;`;
    if(actor.includes(old))await db.query(actor.replace(old,replacement));
    else if(!actor.includes('app.placement_internal_release'))throw Error('ACTOR_GUARD_CHANGED');
    let recordingGuard=(await db.query("SELECT pg_get_functiondef('w04b_recording_guard()'::regprocedure) AS def")).rows[0].def;
    const oldRecording='SELECT v.snapshot,p.body INTO source,policy FROM placement_source_versions v JOIN placement_workflow_policies p ON p."sourceId"=v.id WHERE p.id=sitting."policyId";';
    if(recordingGuard.includes(oldRecording)){
      recordingGuard=recordingGuard.replace(oldRecording,`SELECT v.snapshot,CASE WHEN current_setting('app.placement_internal_release',true)='${decisionId}' AND r.active=true AND r."sourceHash"=v."sourceHash" THEN r.timing ELSE p.body END INTO source,policy
        FROM placement_source_versions v JOIN placement_workflow_policies p ON p."sourceId"=v.id
        LEFT JOIN placement_internal_releases r ON r."sourceId"=v.id AND r."policyId"=p.id AND r."decisionId"='${decisionId}' WHERE p.id=sitting."policyId";`);
      await db.query(recordingGuard);
    }else if(!recordingGuard.includes('app.placement_internal_release'))throw Error('RECORDING_GUARD_CHANGED');
    let appendGuard=(await db.query("SELECT pg_get_functiondef('w04b_append_guard()'::regprocedure) AS def")).rows[0].def;
    const oldObjective="NEW.body->>'state'<>'OBJECTIVE_VERIFIED_DEV'";
    if(appendGuard.includes(oldObjective)){
      appendGuard=appendGuard.replace(oldObjective,`(NEW.body->>'state' IS DISTINCT FROM 'OBJECTIVE_VERIFIED_DEV' AND
        (NEW.body->>'state' IS DISTINCT FROM 'INTERNAL_OBJECTIVE_SCORED' OR
         current_setting('app.placement_internal_release',true) IS DISTINCT FROM '${decisionId}' OR NOT EXISTS(
           SELECT 1 FROM placement_internal_releases r WHERE r."sourceId"=t."placementVersionId" AND r."decisionId"='${decisionId}' AND r.active=true)))`);
      await db.query(appendGuard);
    }else if(!appendGuard.includes('INTERNAL_OBJECTIVE_SCORED'))throw Error('OBJECTIVE_GUARD_CHANGED');
    await db.query(`CREATE OR REPLACE FUNCTION public.w04b_window(s placement_sittings) RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE body JSONB; source JSONB; gid TEXT; t JSONB;
      BEGIN
        IF s.phase='LISTENING' THEN RETURN 2700; ELSIF s.phase='READING' THEN RETURN 4500; ELSIF s.phase='BREAK' THEN RETURN 600; END IF;
        SELECT CASE WHEN current_setting('app.placement_internal_release',true)='${decisionId}' AND r.active=true AND r."sourceHash"=v."sourceHash" THEN r.timing ELSE p.body END,v.snapshot
          INTO body,source FROM placement_workflow_policies p JOIN placement_source_versions v ON v.id=p."sourceId"
          LEFT JOIN placement_internal_releases r ON r."sourceId"=v.id AND r."policyId"=p.id AND r."decisionId"='${decisionId}' WHERE p.id=s."policyId";
        SELECT g->>'id' INTO gid FROM jsonb_array_elements(source->'groups') WITH ORDINALITY x(g,n) WHERE g->>'skill'=s.phase ORDER BY n OFFSET s."taskIndex" LIMIT 1;
        SELECT q INTO t FROM jsonb_array_elements(body->'tasks')q WHERE q->>'groupId'=gid;
        IF t IS NULL THEN RAISE EXCEPTION 'W04B_APPROVED_WINDOW_MISSING' USING ERRCODE='23514'; END IF;
        RETURN (t->>'preparationSeconds')::int+(t->>'playbackSeconds')::int+(t->>'responseSeconds')::int;
      END $$`);
    // Preserve submitted trials. Only these two PO-authorized internal sources
    // allow another sitting; every other preview keeps its one-attempt rule.
    const index=(await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='placement_preview_once'")).rows[0];
    if(!index)throw Error('PLACEMENT_UNIQUENESS_INDEX_MISSING');
    if(!index.indexdef.includes(sources[0])){
      if(!index.indexdef.includes('UNIQUE INDEX')||!index.indexdef.includes('"learnerId", "placementVersionId"'))throw Error('PLACEMENT_UNIQUENESS_INDEX_CHANGED');
      await db.query('DROP INDEX public.placement_preview_once');
      await db.query(`CREATE UNIQUE INDEX placement_preview_once ON test_attempts("learnerId","placementVersionId")
        WHERE "placementVersionId" IS NOT NULL AND "placementVersionId" NOT IN ('${sources[0]}'::uuid,'${sources[1]}'::uuid)`);
    }
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS placement_internal_active_once ON test_attempts("learnerId","placementVersionId")
      WHERE "placementVersionId" IN ('${sources[0]}'::uuid,'${sources[1]}'::uuid) AND status='IN_PROGRESS'`);
    await db.query(`CREATE OR REPLACE FUNCTION public.placement_internal_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE previous_number integer;
      BEGIN
        IF NEW."placementVersionId" IS NULL OR NEW."placementVersionId" NOT IN ('${sources[0]}'::uuid,'${sources[1]}'::uuid) THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(842030);
        IF TG_OP='UPDATE' THEN
          IF NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber" THEN RAISE EXCEPTION 'INTERNAL_ATTEMPT_NUMBER_IMMUTABLE' USING ERRCODE='23514'; END IF;
          RETURN NEW;
        END IF;
        SELECT max("attemptNumber") INTO previous_number FROM test_attempts WHERE "learnerId"=NEW."learnerId" AND "placementVersionId"=NEW."placementVersionId";
        IF previous_number IS NOT NULL THEN
          IF current_setting('app.placement_internal_release',true) IS DISTINCT FROM '${decisionId}' OR
            NOT EXISTS(SELECT 1 FROM placement_internal_releases r JOIN placement_source_versions v ON v.id=r."sourceId"
              WHERE r."sourceId"=NEW."placementVersionId" AND r."sourceHash"=v."sourceHash" AND r."decisionId"='${decisionId}' AND r.active=true) OR
            EXISTS(SELECT 1 FROM test_attempts WHERE "learnerId"=NEW."learnerId" AND "placementVersionId"=NEW."placementVersionId" AND status<>'SUBMITTED')
          THEN RAISE EXCEPTION 'INTERNAL_RETAKE_NOT_AUTHORIZED' USING ERRCODE='23514'; END IF;
          PERFORM br136_bank_check.assert_target(); PERFORM w04b_actor();
        END IF;
        IF NEW."attemptNumber"<>coalesce(previous_number,0)+1 THEN RAISE EXCEPTION 'INTERNAL_ATTEMPT_NUMBER_SEQUENCE' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$`);
    if(!(await db.query("SELECT 1 FROM pg_trigger WHERE tgname='placement_internal_attempt' AND tgrelid='test_attempts'::regclass")).rows.length)
      await db.query('CREATE TRIGGER placement_internal_attempt BEFORE INSERT OR UPDATE ON test_attempts FOR EACH ROW EXECUTE FUNCTION placement_internal_attempt_guard()');
    await db.query('COMMIT');
    fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'internal-placement-release.json'),JSON.stringify({decisionId,decision,sources:verified,media:[...media.values()],verifiedAt:new Date().toISOString()},null,2));
    console.log(JSON.stringify({release:decisionId,banks:verified.map(v=>({mode:v.mode,counts:v.counts})),uniqueVerifiedMedia:media.size}));
  }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
