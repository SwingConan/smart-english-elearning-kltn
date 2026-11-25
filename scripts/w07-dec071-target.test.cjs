const {test}=require('node:test');const assert=require('node:assert/strict');const {verify}=require('./lib/w07-dec071-target.cjs');
const url='postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_unified_runtime01_20261107';
const base={NODE_ENV:'development',W07_ENABLED:'QA_DEC071',W07_RUN_INTENT:'DEC071_INTEGRATED_QA',V2_UNIFIED_RUNTIME:'DEV_UNIFIED_01',W07_EXPECTED_DATABASE:'v2_wave01_dev_test_w04b_unified_runtime01_20261107',W07_VERIFIED_OID:'953322',DATABASE_URL:url,E2E_DATABASE_URL:url};
test('rejects missing intent and production before a database connection',async()=>{
 for(const variant of [{NODE_ENV:'production'},{W07_RUN_INTENT:''},{W07_ENABLED:'DEV_DEC049'},{V2_UNIFIED_RUNTIME:''},{DATABASE_URL:'postgresql://forbidden'}])await assert.rejects(verify({...base,...variant}),/DEC071_EXPLICIT_QA_INTENT_REQUIRED/);
});
test('rejects baseline, foreign port, role and target identity before a connection',async()=>{
 for(const raw of [url.replace('55401','5432'),url.replace('wave01@','postgres@'),url.replace('unified_runtime01_20261107','baseline_20986')])await assert.rejects(verify({...base,DATABASE_URL:raw,E2E_DATABASE_URL:raw}),/DEC071_EXACT_TARGET_REQUIRED/);
 await assert.rejects(verify({...base,W07_VERIFIED_OID:'20986'}),/DEC071_EXACT_TARGET_REQUIRED/);
});
