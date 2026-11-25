const {ESLint}=require('eslint');
const {readFileSync,writeFileSync,readdirSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
(async()=>{
  const eslint=new ESLint({cwd:resolve(root,'apps/api')});
  const rows=[];
  for(const name of readdirSync(resolve(root,'docs/v2/br136/before')).filter(n=>n.endsWith('.ts'))){
    const filePath=resolve(root,'apps/api/src/modules/placement',name);
    const [before]=await eslint.lintText(readFileSync(resolve(root,'docs/v2/br136/before',name),'utf8'),{filePath});
    const [after]=await eslint.lintText(readFileSync(filePath,'utf8'),{filePath});
    function counts(r){const c={};for(const m of r.messages)c[m.ruleId]=(c[m.ruleId]||0)+1;return c;}
    rows.push({filePath,before:{errorCount:before.errorCount,rules:counts(before)},after:{errorCount:after.errorCount,rules:counts(after)},newRuleCountIncrease:Object.entries(counts(after)).filter(([k,n])=>n>(counts(before)[k]||0))});
  }
  const newFiles=await eslint.lintFiles(['src/modules/placement/structured-advice.ts','src/modules/placement/br136-advisory.spec.ts','test/br136-advisory-http.e2e-spec.ts'].map(p=>resolve(root,'apps/api',p)));
  const proof={status:rows.every(r=>r.newRuleCountIncrease.length===0)&&newFiles.every(r=>r.errorCount===0)?'NO_NEW_LINT_FINDINGS_IN_PATCH':'FAIL',rows,newFiles:newFiles.map(r=>({file:r.filePath,errorCount:r.errorCount,messages:r.messages})),fullLint:{apiErrors:116,webErrors:15,status:'FAIL',logs:['API-lint.log','Web-lint.log']}};
  writeFileSync(resolve(root,'docs/v2/br136/LINT_BASELINE_PARITY.json'),JSON.stringify(proof,null,2));console.log(proof.status);
})();
