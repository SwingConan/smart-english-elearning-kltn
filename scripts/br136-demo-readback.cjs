'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Client}=require('pg');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'docs/v2/br136-working-product');
const db=new Client({connectionString:'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33',connectionTimeoutMillis:3000});
(async()=>{
 try{
  await db.connect();await db.query('BEGIN READ ONLY');await db.query('SELECT br136_bank_check.assert_target()');
  const [i]=(await db.query("SELECT oid::text AS oid,current_setting('transaction_read_only') AS read_only FROM pg_database WHERE datname=current_database()")).rows;
  if(i.oid!=='1313121'||i.read_only!=='on')throw Error('INDEPENDENT_READONLY_REQUIRED');
  const rows=(await db.query('SELECT o.id,o.amount_vnd,r.id AS receipt_id,r.provider_transaction_uuid,r.provider_response_hash FROM br136_bank_check.orders o LEFT JOIN br136_bank_check.receipts r ON r.order_id=o.id WHERE NOT EXISTS(SELECT 1 FROM br136_bank_check.cancellations c WHERE c.order_id=o.id)')).rows;
  if(rows.length>1)throw Error('ONE_ORDER_REQUIRED');
  const order=rows[0];
  const cancelled=(await db.query('SELECT count(*)::int AS n FROM br136_bank_check.cancellations')).rows[0].n;
  const proof={databaseOid:i.oid,readOnly:true,orderCount:rows.length,cancelledOrderCount:cancelled,amountVnd:order?.amount_vnd??null,state:order?.receipt_id?'RECEIPT_CONFIRMED':order?'PENDING':'NO_ORDER',
   independentProviderEvidencePersisted:!!order?.receipt_id&&/^[a-f0-9]{64}$/.test(order.provider_response_hash),
   providerTransactionDigest:order?.provider_transaction_uuid?crypto.createHash('sha256').update(order.provider_transaction_uuid).digest('hex'):null,
   protectedQaAccessed:false,academicEntitlementChanged:false,bankDetailsInEvidence:false};
  fs.writeFileSync(path.join(OUT,'BANK_CHECK_DATABASE_READBACK.json'),JSON.stringify(proof,null,2));
  const candidates=['users','courses','course_versions','class_offerings','enrollments','class_schedules','lessons','class_sections','class_activities','assignments','test_attempts','assessment_tasks','assessment_responses','attendance_records','consultations'];
  const present=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[candidates])).rows.map(r=>r.tablename);
  const counts={};for(const table of present)counts[table]=Number((await db.query('SELECT count(*)::int AS n FROM public."'+table+'"')).rows[0].n);
  fs.writeFileSync(path.join(OUT,'DEMO_DATA_COUNTS.json'),JSON.stringify({databaseOid:i.oid,readOnly:true,counts,provenance:'COPIED_SYNTHETIC_DATA_NOT_OFFICIAL',all57UseCasesVerified:false,fullLinkedDatasetVerified:false},null,2));
  await db.query('ROLLBACK');console.log(JSON.stringify(proof,null,2));
 }finally{await db.end();}
})().catch(()=>{console.error('INDEPENDENT_DEMO_READBACK_BLOCKED_REDACTED');process.exitCode=1;});
