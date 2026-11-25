'use strict';
// Bounded local verification after recovering the interrupted implementation.
// Trial answers are arbitrary; this is not evidence of the learner's ability.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, OUT, connect } = require('./education/target.cjs');
const { credential, ORIGIN } = require('./education/local-client.cjs');
const { chromium } = require(path.join(ROOT, '.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));

(async () => {
  const proof = { origin: ORIGIN, verifiedAt: new Date().toISOString(), learner: 'student@gmail.com',
    notice: 'Functional trial only; arbitrary answers, no answer-key lookup or learner ability claim. No Speaking/Writing recordings or grades fabricated.', checks: {}, errors: [] };
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-gpu', '--no-first-run', '--disable-background-networking'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const c = credential(proof.learner);
    const auth = await context.request.post(ORIGIN + '/api/auth/login', { headers: { origin: ORIGIN }, data: { email: c.email, password: c.password } });
    assert(auth.ok(), 'LOGIN_FAILED');
    const request = async (route) => {
      const response = await context.request.get(ORIGIN + '/api/v2/placement' + route);
      assert(response.ok(), `GET ${route}: ${response.status()}`);
      return response.json();
    };
    const initial = await request('/config');
    assert.equal(initial.fullExamEnabled, true);
    assert.equal(initial.releaseScope, 'SMART_ENGLISH_INTERNAL_LOCALHOST');
    assert.deepEqual(initial.sources.map(s => s.itemCount).sort((a,b) => a-b), [200,219]);
    const lr = initial.sources.find(s => s.mode === 'LR');
    assert(lr.retakeAllowed, 'SUBMITTED_TRIAL_MUST_NOT_BLOCK_NEW_INTERNAL_SITTING');
    const previous = await request('/workflow/attempts/' + lr.attemptId + '/diagnostic');
    const beforeHistory = await request('/history');
    const page = await context.newPage();
    page.on('pageerror', e => proof.errors.push(e.message));
    page.on('dialog', d => void d.accept());
    await page.goto(ORIGIN + '/placement');
    await page.getByRole('heading', { name: 'Kiểm tra đầu vào Smart English', exact: true }).waitFor();
    await page.locator('input[type=radio][value=LR]').check();
    await page.locator('input[type=number]').first().fill('650');
    await page.getByRole('button', { name: 'Bắt đầu lượt mới', exact: true }).click();
    await page.waitForURL(/\/placement\/sittings\/[a-f0-9-]+$/);
    const attemptId = page.url().split('/').pop();
    assert.notEqual(attemptId, lr.attemptId);
    proof.attemptId = attemptId;
    const getExam = () => request('/workflow/attempts/' + attemptId);
    let exam = await getExam();
    assert.equal(exam.phase, 'LISTENING');
    assert.equal(exam.groups.reduce((n,g) => n + g.questions.length, 0), 100);
    assert(!JSON.stringify(exam).includes('isCorrect') && !JSON.stringify(exam).includes('explanation'), 'ANSWER_KEY_LEAK');
    for (const type of ['AUDIO','IMAGE']) {
      const stimulus = exam.groups[0].stimuli.find(s => s.type === type);
      assert(stimulus?.mediaUrl, `${type}_MISSING`);
      const media = await context.request.get(ORIGIN + stimulus.mediaUrl);
      assert(media.ok() && (await media.body()).length > 100, `${type}_HTTP_FAILED`);
    }
    await page.getByRole('button', { name: 'Lưu câu trả lời', exact: true }).waitFor();
    await page.locator('audio').first().evaluate(async audio => {
      await audio.play(); audio.pause();
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw Error('AUDIO_DECODE_FAILED');
    });
    const saveAnswer = async () => {
      await page.locator('input[type=radio]').first().check();
      const saved = page.waitForResponse(r => r.url().endsWith('/answers') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Lưu câu trả lời', exact: true }).click();
      assert((await saved).ok(), 'ANSWER_SAVE_FAILED');
    };
    const next = async () => {
      const response = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Kết thúc phần / bài hiện tại', exact: true }).click();
      assert((await response).ok(), 'TRANSITION_FAILED');
    };
    await saveAnswer();
    await page.reload();
    await page.getByRole('button', { name: 'Lưu câu trả lời', exact: true }).waitFor();
    assert(await page.locator('input[type=radio]').first().isChecked(), 'ANSWER_NOT_RESTORED');
    await page.screenshot({ path: path.join(OUT, 'internal-placement-recovered-listening.png') });
    await next();
    await page.getByText('Đọc hiểu', { exact: true }).first().waitFor();
    exam = await getExam();
    assert.equal(exam.phase, 'READING');
    assert.equal(exam.groups.reduce((n,g) => n + g.questions.length, 0), 100);
    await saveAnswer();
    await next();
    exam = await getExam();
    assert.equal(exam.phase, 'SUBMITTED');
    assert(exam.receipt, 'SUBMISSION_RECEIPT_MISSING');
    const result = await request('/workflow/attempts/' + attemptId + '/diagnostic');
    assert.equal(result.officialToeicScore, null);
    assert(result.skillResults.every(s => Number.isInteger(s.value) && s.samples === 100));
    assert.deepEqual((await request('/workflow/attempts/' + lr.attemptId + '/diagnostic')).skillResults, previous.skillResults);
    const afterHistory = await request('/history');
    assert.equal(afterHistory.length, beforeHistory.length + 1);
    assert(afterHistory.some(h => h.attemptId === attemptId && h.status === 'SUBMITTED' && h.mode === 'LR'));
    await page.goto(ORIGIN + '/placement/sittings/' + attemptId + '/result');
    await page.getByText(result.label, { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(OUT, 'internal-placement-recovered-result-mobile.png'), fullPage: true });
    await page.goto(ORIGIN + '/placement');
    await page.locator('input[type=radio][value=FOUR_SKILLS]').check();
    assert.equal(await page.locator('input[type=number]').count(), 3);
    await page.getByRole('button', { name: 'Tiếp tục làm bài', exact: true }).waitFor();
    await page.screenshot({ path: path.join(OUT, 'internal-placement-recovered-four-skills-mobile.png'), fullPage: true });
    const { db } = await connect();
    try {
      const stored = (await db.query('SELECT "attemptNumber", status, "placementReceipt" FROM test_attempts WHERE id=$1', [attemptId])).rows[0];
      assert(stored.attemptNumber > 1 && stored.status === 'SUBMITTED' && stored.placementReceipt === exam.receipt);
      const grades = (await db.query('SELECT skill,"graderId","rubricId","assignmentId" FROM placement_human_evaluations WHERE "attemptId"=$1', [attemptId])).rows;
      assert.equal(grades.length, 1);
      assert(grades[0].skill === 'LR' && !grades[0].graderId && !grades[0].rubricId && !grades[0].assignmentId);
      const tasks = (await db.query('SELECT "sourceId", active, decision, timing FROM placement_internal_releases ORDER BY "sourceId"')).rows;
      assert.equal(tasks.length, 2);
      assert(tasks.every(t => t.active && t.decision.authority === 'PO_USER_CONFIRMATION' && t.decision.humanSignature === null));
      proof.checks = { fullExamEnabled: true, sourceItemCounts: [200,219], audioDecoded: true, imageLoaded: true,
        answerSurvivedReload: true, newAttemptNumber: stored.attemptNumber, resultStored: result.skillResults,
        previousResultPreserved: true, fourSkillsSelectableAndResumable: true, noForgedTeacherGrade: true,
        swTaskWindows: tasks.reduce((n,t) => n + t.timing.tasks.length, 0), mobileOverflow: false };
    } finally { await db.end(); }
    assert.equal(proof.errors.length, 0);
    fs.writeFileSync(path.join(OUT, 'internal-placement-recovery.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } catch (error) {
    proof.failure = error.message;
    fs.writeFileSync(path.join(OUT, 'internal-placement-recovery.json'), JSON.stringify(proof, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
