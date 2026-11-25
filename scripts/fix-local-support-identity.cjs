'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,ROOT,OUT}=require('./education/target.cjs');
(async()=>{const {db}=await connect(false);try{
 const original=(await db.query("SELECT pg_get_functiondef('public.w05_role()'::regprocedure) AS definition")).rows[0].definition;
 fs.mkdirSync(OUT,{recursive:true});const backup=path.join(OUT,'support-role-before.sql');if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
 const sql=fs.readFileSync(path.join(ROOT,'apps/api/prisma/migrations/20261113010000_demo_support_session_identity/migration.sql'),'utf8');
 await db.query(sql);await db.query('COMMIT');console.log('Pinned demo support session identity repaired. No grants or business records changed.');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
