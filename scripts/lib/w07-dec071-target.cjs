const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
async function verify(env=process.env){
 const name='v2_wave01_dev_test_w04b_unified_runtime01_20261107',raw=env.E2E_DATABASE_URL;
 if(env.NODE_ENV==='production'||env.W07_ENABLED!=='QA_DEC071'||env.W07_RUN_INTENT!=='DEC071_INTEGRATED_QA'||env.V2_UNIFIED_RUNTIME!=='DEV_UNIFIED_01'||!raw||raw!==env.DATABASE_URL)throw Error('DEC071_EXPLICIT_QA_INTENT_REQUIRED');
 const u=new URL(raw);if(u.hostname!=='127.0.0.1'||u.port!=='55401'||u.username!=='wave01'||u.pathname!=='/'+name||env.W07_EXPECTED_DATABASE!==name||env.W07_VERIFIED_OID!=='953322')throw Error('DEC071_EXACT_TARGET_REQUIRED');
 const {Client}=require('pg'),db=new Client({connectionString:raw,options:'-c default_transaction_read_only=on -c timezone=UTC'});await db.connect();try{
 await db.query('SELECT runtime_v2.assert_target(),sepay_v2.assert_target()');
 const i=(await db.query("SELECT oid::text oid,(pg_control_system()).system_identifier::text physical,current_setting('data_directory') dir FROM pg_database WHERE datname=current_database()")).rows[0];
 if(i.oid!=='953322'||i.physical!=='7702384118803149788'||path.resolve(i.dir)!==path.resolve(__dirname,'../../.local-storage/v2-wave01/postgres'))throw Error('DEC071_PHYSICAL_IDENTITY_REQUIRED');
 const ledger=(await db.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;if(ledger.length!==32)throw Error('DEC071_PRISMA_32_REQUIRED');for(const m of ledger)if(m.checksum!==crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../apps/api/prisma/migrations',m.migration_name,'migration.sql'))).digest('hex'))throw Error('DEC071_SOURCE_CHECKSUM_REQUIRED');
 const a=(await db.query('SELECT version,checksum FROM academic_offer_v2.migrations ORDER BY version')).rows;for(const m of a)if(m.checksum!==crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../apps/api/sql/academic-offer',m.version+'.sql'))).digest('hex'))throw Error('DEC071_LEDGER_CHECKSUM_REQUIRED');if(!a.some(m=>m.version==='003-dec071-admission'))throw Error('DEC071_ADMISSION_BINDING_REQUIRED');
 }finally{await db.end();}
}
module.exports={verify};
