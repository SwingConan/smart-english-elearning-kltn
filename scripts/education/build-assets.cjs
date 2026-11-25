'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, OUT } = require('./target.cjs');
const { units, lessons, questions, answers } = require('./curriculum.cjs');
const driver=path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core');
const escape = s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
(async()=>{
  fs.mkdirSync(path.join(OUT,'assets'),{recursive:true});
  fs.mkdirSync(path.join(ROOT,'apps/web/public/learning/toeic-foundation'),{recursive:true});
  fs.writeFileSync(path.join(OUT,'audio-scripts.json'),JSON.stringify(units.map((u,i)=>({fileName:`unit-${String(i+1).padStart(2,'0')}.wav`,text:u.script})),null,2));
  const {chromium}=require(driver);
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
  try {
    const page=await browser.newPage();
    for(const [i,u] of units.entries()) {
      const number=String(i+1).padStart(2,'0');
      const parts=lessons(u,i);
      const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><title>${escape(u.title)}</title><style>@page{size:A4;margin:18mm}body{font:11pt/1.6 Arial,sans-serif;color:#172033}h1{font-size:21pt;color:#3730a3}h2{font-size:15pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}p{white-space:pre-wrap}section{break-before:page}small{color:#64748b}footer{margin-top:20px;border-top:1px solid #ddd;padding-top:8px;font-size:9pt}</style><h1>Smart English · Học phần ${number}</h1><h2>${escape(u.title)}</h2><p>Nội dung nguyên bản · TOEIC nền tảng · Nghe, Đọc và giao tiếp công sở</p><p>${escape(u.goals.map(g=>'• '+g).join('\n'))}</p>${parts.map((p,j)=>`<${j?'section':'div'}><h2>${escape(p.title)}</h2>${p.markdown.replace(/\x60\x60\x60audio[\s\S]*?\x60\x60\x60/g,'Audio: mở bài học trực tuyến để nghe hoặc tải tệp WAV.').split('\n').map(line=>{const h=/^(#{1,3})\s+(.+)$/.exec(line);return h?`<h3>${escape(h[2])}</h3>`:`<p>${escape(line)}</p>`}).join('')}</${j?'section':'div'}>`).join('')}<section><h2>Tự kiểm tra ngữ pháp</h2><p>${escape(questions(u.quiz.slice(0,2)))}</p><h3>Đáp án và giải thích</h3><p>${escape(answers(u.quiz.slice(0,2)))}</p><h3>Phiếu ghi lỗi</h3><p>Câu hoặc chi tiết đã nhầm: ____________________\nBằng chứng trong bài: ____________________\nCách sửa và ví dụ mới: ____________________\nNgày tự luyện thực tế: ____________________</p></section><footer>Tài liệu học tập Smart English. Các tình huống trong bài được biên soạn để luyện ngôn ngữ, không ghi nhận giao dịch, buổi dạy hay thành tích cá nhân. Lịch và hạn nộp của lớp xem trên LMS.</footer></html>`;
      await page.setContent(html,{waitUntil:'load'});
      await page.pdf({path:path.join(OUT,'assets',`hoc-phan-${number}.pdf`),format:'A4',printBackground:true});
      console.log(`PDF ${number}: ${u.title}`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
