'use strict';
const { Client } = require('pg');
const path = require('node:path');
const C = require('../lib/br136-launcher-config.cjs');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, '.local-storage/education-preparation');

async function connect(readOnly = true) {
  const db = new Client({ connectionString: 'postgresql://wave01@127.0.0.1:55401/' + C.DATABASE, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    await db.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    const i = (await db.query(`SELECT oid::text AS oid, current_database() AS database,
      (pg_control_system()).system_identifier::text AS physical,
      current_setting('data_directory') AS directory, host(inet_server_addr()) AS host,
      inet_server_port() AS port, shobj_description(oid, 'pg_database') AS marker,
      current_user AS actor, session_user AS session_actor
      FROM pg_database WHERE datname=current_database()`)).rows[0];
    if (i.oid !== C.OID || i.database !== C.DATABASE || i.physical !== C.PHYSICAL || i.marker !== C.MARKER ||
      i.directory.replaceAll('\\', '/').toLowerCase() !== C.DATA.replaceAll('\\', '/').toLowerCase() ||
      i.host !== '127.0.0.1' || i.port !== 55401 || i.actor !== 'wave01' || i.session_actor !== 'wave01') throw Error('EDUCATION_DEMO_IDENTITY_REQUIRED');
    await db.query('SELECT br136_bank_check.assert_target()');
    await db.query("SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh'");
    await db.query("SET LOCAL lock_timeout='3s'");
    return { db, identity: i };
  } catch (error) { await db.end(); throw error; }
}

module.exports = { connect, ROOT, OUT };
