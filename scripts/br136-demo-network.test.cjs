'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertSePayReadbackTarget}=require('./lib/br136-demo-network.cjs');
test('URL objects used by real SePay transaction readback reach a fake transport once', async()=>{
 let calls=0;
 const fakeNative=async()=>{calls++;return {status:200};};
 const guarded=async(input,options)=>{assertSePayReadbackTarget(input,options);return fakeNative(input,options);};
 const result=await guarded(new URL('https://userapi.sepay.vn/v2/transactions?reference_number=OFFLINE_REFERENCE'));
 assert.equal(result.status,200);assert.equal(calls,1);
});
test('accepts the existing string bank-account request and native Request GET',()=>{
 assert.doesNotThrow(()=>assertSePayReadbackTarget('https://userapi.sepay.vn/v2/bank-accounts/20000000-0000-4000-8000-000000000001'));
 assert.doesNotThrow(()=>assertSePayReadbackTarget(new Request('https://userapi.sepay.vn/v2/transactions')));
});
for(const [name,input,options] of [
 ['Gemini','https://generativelanguage.googleapis.com/v1beta/models/test:generateContent',{}],
 ['other host','https://example.invalid/v2/transactions',{}],
 ['other SePay API','https://userapi.sepay.vn/v2/other',{}],
 ['write request','https://userapi.sepay.vn/v2/transactions',{method:'POST'}],
])test('blocks '+name+' before transport',()=>assert.throws(()=>assertSePayReadbackTarget(input,options),/DEMO_UNAPPROVED_EXTERNAL_FETCH_BLOCKED/));
