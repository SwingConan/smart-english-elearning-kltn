// No dotenv, seed, migration, data repair or alternate connection path.
import { runM07Checker } from './check-m07-visual-gate-data.mjs';
process.exitCode = await runM07Checker({ argv: process.argv.slice(2) });
