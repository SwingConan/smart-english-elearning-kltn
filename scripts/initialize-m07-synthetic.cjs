// Separate DEV-only writer; no schema/database creation or dotenv imports.
const { initializeFixture } = require('./lib/m07-fixture-target.cjs');
if (process.argv.length !== 2) {
  console.error('M07_FIXTURE_ARGUMENTS_FORBIDDEN');
  process.exitCode = 1;
} else
  initializeFixture({ onEvidence: (e) => console.log('M07_FIXTURE_IDENTITY ' + JSON.stringify(e)) })
    .then((r) => console.log('M07_FIXTURE_RESULT ' + JSON.stringify(r)))
    .catch(() => {
      console.error('M07_FIXTURE_INITIALIZATION_FAILED_CLOSED');
      process.exitCode = 1;
    });
