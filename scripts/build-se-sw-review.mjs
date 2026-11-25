import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { candidateQuestion, validatePilot } from './se-sw-pilot.mjs';

const root = resolve('.local-storage/se-sw-01');
const manifest = JSON.parse(readFileSync(resolve(root, 'private-manifest.json'), 'utf8'));
const result = validatePilot(manifest, root);
if (!result.mechanicalPass)
  throw new Error('Fix media validation before building the review page.');
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const sheet = manifest.informationSheet;
const table = `<div class="table-scroll" role="region" aria-label="${escape(sheet.caption)}" tabindex="0"><table><caption>${escape(sheet.caption)}</caption><thead><tr>${sheet.columns.map((c) => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${sheet.rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th scope="row">${escape(c)}</th>` : `<td>${escape(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
const sections = manifest.questions
  .map((original) => {
    const q = candidateQuestion(original);
    const assets = q.mediaAssetIds.map((id) => manifest.assets.find((a) => a.assetId === id));
    return `<section id="${escape(q.questionId)}" tabindex="-1"><h2>${escape(q.questionId)}</h2><p>${escape(q.instructions)}</p><p class="prompt">${escape(q.promptText)}</p>${q.requiredWords.length ? `<p>Required words: ${q.requiredWords.map(escape).join(' / ')}</p>` : ''}${q.informationSheetId ? table : ''}${assets.map((a) => (a.kind === 'IMAGE' ? `<img src="${escape(a.relativePath)}" alt="${escape(q.questionId)} stimulus">` : `<audio controls preload="metadata" src="${escape(a.relativePath)}" aria-label="${escape(q.questionId)} question audio"></audio><p>Reviewer playback: unlimited. Exam policy: two automatic plays, then a 30-second recording window; this reviewer player is separate.</p>`)).join('')}<p>Prep: ${escape(q.prepSeconds ?? 'shared / N/A')} s; response: ${escape(q.responseSeconds ?? 'shared section')} s.</p><label><input type="checkbox" class="mark" data-question="${escape(q.questionId)}"> Mark for review</label><span role="status" class="mark-status"></span></section>`;
  })
  .join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SE-SW-01 — private batch review</title><style>body{font:16px/1.6 system-ui;margin:24px;color:#172033;background:#f5f7fb}header,section,aside{background:white;border:1px solid #dce2ef;border-radius:12px;padding:20px;margin-bottom:20px}main{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,1fr);gap:24px}aside{align-self:start;position:sticky;top:16px}nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr));gap:8px}a{padding:8px;color:#283e82}section:focus{outline:3px solid #7387d9}img{max-width:100%;height:auto}audio{width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd3e0;padding:10px;text-align:left}caption{font-weight:bold;padding:12px}.table-scroll{overflow:auto}.prompt{white-space:pre-wrap}a.marked{background:#fff0bd}a:focus-visible,input:focus-visible{outline:3px solid #526ade}@media(max-width:800px){main{display:block}aside{position:static}}</style><header><h1>SE-SW-01 · Private batch review</h1><p>DRAFT · NOT ACADEMICALLY APPROVED · NOT PUBLISHED</p><p>Reviewer copy with question scripts for listening comparison. Local files only. Do not host publicly. Mark is review state and never an answer or grade.</p><p>Mechanical check: 7 PNG + 6 WAV passed. Two-person semantic/listening QA and SAPI distribution rights remain pending. W5 content v02 and S10 policy follow PO decisions.</p></header><main><div>${sections}</div><aside><h2>Question navigator</h2><nav aria-label="Question navigator">${manifest.questions.map((q) => `<a href="#${escape(q.questionId)}" data-link="${escape(q.questionId)}">${escape(q.questionId)}</a>`).join('')}</nav></aside></main><script>for(const mark of document.querySelectorAll('.mark')){mark.addEventListener('change',()=>{document.querySelector('[data-link="'+mark.dataset.question+'"]').classList.toggle('marked',mark.checked);mark.closest('section').querySelector('.mark-status').textContent=mark.checked?' Marked for review':' Unmarked';});}for(const link of document.querySelectorAll('nav a')){link.addEventListener('click',()=>document.getElementById(link.hash.slice(1)).focus());}</script></html>`;
writeFileSync(resolve(root, 'review.html'), html);
console.log('Private review page: .local-storage/se-sw-01/review.html');
