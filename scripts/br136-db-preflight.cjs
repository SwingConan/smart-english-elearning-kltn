const { Client } = require('pg');
const { writeFileSync } = require('node:fs');
(async () => {
  const c = new Client({
    connectionString: 'postgresql://wave01@127.0.0.1:55401/postgres',
    connectionTimeoutMillis: 3000,
  });
  const proof = { readOnly: true, protectedQaFreshVerification: false };
  try {
    await c.connect();
    await c.query('BEGIN READ ONLY');
    proof.identity = (
      await c.query(
        "SELECT current_database() AS db,current_setting('data_directory') AS directory,oid::text FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0];
    await c.query('ROLLBACK');
    proof.status = 'AVAILABLE';
  } catch (e) {
    proof.status = 'BLOCKED';
    proof.code = e.code;
    proof.message = e.message;
  } finally {
    await c.end();
  }
  writeFileSync('docs/v2/br136/DB-preflight.json', JSON.stringify(proof, null, 2));
  console.log(proof);
})();
