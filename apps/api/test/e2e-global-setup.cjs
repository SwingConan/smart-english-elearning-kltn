// Runs before suites are imported, including direct raw Jest invocations.
module.exports = async () => {
  if (process.env.W07_CF_RUN_INTENT) {
    await require('../../../scripts/lib/w07-cf-target.cjs').verify();
    return;
  }
  if (process.env.W07_RUN_INTENT) {
    await require('../../../scripts/lib/w07-target.cjs').verify();
    return;
  }
  if (process.env.W06_RUN_INTENT) {
    await require('../../../scripts/lib/w06-target.cjs').verify();
    return;
  }
  await require('../../../scripts/lib/e2e-target.cjs').verify();
};
