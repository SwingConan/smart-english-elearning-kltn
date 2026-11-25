// Creates NEW disposable databases on the explicitly isolated Batch 04 cluster only.
// Never reads DATABASE_URL/.env as a connection target. Never drops a database.
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
const endpoint=process.env.BATCH04_PG_URL;
if(!endpoint)throw new Error('Explicit BATCH04_PG_URL required');
const parsed=new URL(endpoint);
if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55404'||parsed.pathname!=='/se_sw_batch04_dev')throw new Error('Not the isolated Batch04 endpoint');
const base=resolve('.local-storage/se-sw-01/batch-04/migration-check-'+Date.now());mkdirSync(base,{recursive:true});
const adminUrl=new URL(endpoint);adminUrl.pathname='/postgres';
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const {rows:[location]}=await admin.query('SHOW data_directory');
if(resolve(location.data_directory)!==resolve('.local-storage/se-sw-01/batch-04/postgres'))throw new Error('Unexpected PostgreSQL data_directory');
const name='se_sw_batch04_upgrade_'+Date.now();await admin.query('CREATE DATABASE '+name);await admin.end();
const target=new URL(endpoint);target.pathname='/'+name;
const migrations=resolve('apps/api/prisma/migrations'),prefix=resolve(base,'old-migrations');mkdirSync(prefix);
for(const entry of readdirSync(migrations))if(entry!=='20261030010000_v2_s10_durable_recovery')cpSync(resolve(migrations,entry),resolve(prefix,entry),{recursive:true});
const config=resolve(base,'prisma.config.ts');
writeFileSync(config,`import {defineConfig} from 'prisma/config'; export default defineConfig({schema:${JSON.stringify(resolve('apps/api/prisma/schema.prisma'))},migrations:{path:${JSON.stringify(prefix)}},datasource:{url:process.env.BATCH04_TARGET!}});`);
const env={...process.env,BATCH04_TARGET:target.toString(),DATABASE_URL:target.toString(),SHADOW_DATABASE_URL:'postgresql://batch04@127.0.0.1:55404/se_sw_batch04_shadow'};
function deploy(path){const log=execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--config',path],{env,encoding:'utf8'});writeFileSync(resolve(base,path===config?'before.log':'after.log'),log);}
deploy(config);
const db=new Client({connectionString:target.toString()});await db.connect();
const ids=Array.from({length:5},()=>randomUUID());
await db.query(`INSERT INTO users(id,email,"passwordHash","fullName",role,"updatedAt") VALUES ($1,$2,'disabled-synthetic','Synthetic migration record','STUDENT',NOW())`,[ids[0],ids[0]+'@example.invalid']);
await db.query(`INSERT INTO tests(id,purpose,"placementMode",title,"updatedAt") VALUES ($1,'PLACEMENT','FOUR_SKILLS','Synthetic pre-existing record',NOW())`,[ids[1]]);
await db.query(`INSERT INTO questions(id,"responseType",difficulty,"toeicSkill",content,"updatedAt") VALUES ($1,'AUDIO_RESPONSE','EASY','SPEAKING','Synthetic historical response',NOW())`,[ids[2]]);
await db.query(`INSERT INTO test_questions(id,"testId","questionId","orderIndex") VALUES ($1,$2,$3,0)`,[ids[3],ids[1],ids[2]]);
await db.query(`INSERT INTO test_attempts(id,"testId","learnerId","attemptNumber","updatedAt") VALUES ($1,$2,$3,1,NOW())`,[ids[4],ids[1],ids[0]]);
await db.query(`INSERT INTO test_answers(id,"attemptId","testQuestionId","textResponse","updatedAt") VALUES ($1,$2,$3,'Synthetic preserved payload',NOW())`,[randomUUID(),ids[4],ids[3]]);
const tables=['users','tests','questions','test_questions','test_attempts','test_answers'];
async function snapshot(){const result={};for(const table of tables){const {rows}=await db.query(`SELECT * FROM ${table} ORDER BY id`);result[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;}
const before=await snapshot();
execFileSync('C:/Program Files/PostgreSQL/14/bin/pg_dump.exe',['-h','127.0.0.1','-p','55404','-U',parsed.username,'-d',name,'-Fc','-f',resolve(base,'before.private.dump')]);
deploy(resolve('apps/api/prisma.config.ts'));
const after=await snapshot();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Historical records changed');
const {rows:[constraint]}=await db.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conname='s10_counts'");
if(constraint.count!==1)throw new Error('Missing S10 constraints');
await db.end();
const restoreName=name+'_restore',freshName=name+'_fresh';
const restoreAdmin=new Client({connectionString:adminUrl.toString()});await restoreAdmin.connect();
await restoreAdmin.query('CREATE DATABASE '+restoreName);await restoreAdmin.query('CREATE DATABASE '+freshName);await restoreAdmin.end();
execFileSync('C:/Program Files/PostgreSQL/14/bin/pg_restore.exe',['-h','127.0.0.1','-p','55404','-U',parsed.username,'-d',restoreName,'--exit-on-error',resolve(base,'before.private.dump')]);
const restoreUrl=new URL(endpoint);restoreUrl.pathname='/'+restoreName;
const restored=new Client({connectionString:restoreUrl.toString()});await restored.connect();
for(const table of tables){const {rows}=await restored.query(`SELECT * FROM ${table} ORDER BY id`);
  if(createHash('sha256').update(JSON.stringify(rows)).digest('hex')!==before[table].sha256)throw new Error('Backup restore mismatch: '+table);}
const {rows:[empty]}=await restored.query("SELECT to_regclass('exam_task_progress') AS ledger");
if(empty.ledger!==null)throw new Error('Pre-migration restore unexpectedly has ledger');await restored.end();
const freshUrl=new URL(endpoint);freshUrl.pathname='/'+freshName;
const freshLog=execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--config',resolve('apps/api/prisma.config.ts')],{env:{...env,DATABASE_URL:freshUrl.toString()},encoding:'utf8'});
writeFileSync(resolve(base,'fresh.log'),freshLog);
const fresh=new Client({connectionString:freshUrl.toString()});await fresh.connect();
const {rows:[applied]}=await fresh.query('SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL');
const {rows:[resetIndex]}=await fresh.query("SELECT count(*)::int AS count FROM pg_indexes WHERE indexname='s10_one_reset_per_attempt'");
if(applied.count!==15||resetIndex.count!==1)throw new Error('Fresh migration/invariant incomplete');await fresh.end();
const result={pass:true,database:name,historicalTablesUnchanged:before,backupCreated:true,backupRestoreVerified:true,restoreDatabase:restoreName,freshDatabase:freshName,freshMigrationsApplied:15,attemptWideResetIndexVerified:true,additiveMigration:true,productionTouched:false,
  note:'New isolated database: 14 historical migrations, synthetic pre-existing records, final additive migration; pre-migration pg_dump restored to a separate new database and all six table hashes match.'};
writeFileSync(resolve('.local-storage/se-sw-01/batch-04/migration-upgrade-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
