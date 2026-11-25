import { describe,it,expect,vi } from 'vitest';
describe('verified demo editorial view',()=>{
 it('leaves presentation unchanged without a verified demo environment',async()=>{
  vi.resetModules();const {presentDemoResponse}=await import('./presentation');
  const source={fullName:'Wave01 DEV STUDENT 10',title:'[SYNTHETIC DEMO] Daily routines'};
  expect(presentDemoResponse(source)).toEqual(source);
 });
 it('uses natural display copy while preserving identity, scores, price and permission data',async()=>{
  vi.resetModules();const {presentDemoResponse,confirmDemoEnvironment}=await import('./presentation');confirmDemoEnvironment();
  const source={id:'1313121',fullName:'Wave01 DEV STUDENT 10',email:'dev@example.invalid',role:'STUDENT',code:'SYNTHETIC_DEMO_STUDY',state:'UNPAID',amountVnd:1850000,normalizedScore:null,finalize:false,scopeId:'1313121',title:'[SYNTHETIC DEMO] Daily routines',audit:[{title:'DEV original audit',reason:'SYNTHETIC evidence retained'}],snapshot:{name:'SYNTHETIC locked terms'}};
  const output=presentDemoResponse(source);
  expect(output.fullName).toBe('Nguyễn Minh An');expect(output.title).toBe('01 · Nói về thói quen hằng ngày');
  for(const key of ['id','email','role','code','state','amountVnd','normalizedScore','finalize','scopeId','audit','snapshot'] as const)expect(output[key]).toEqual(source[key]);
  expect(source.fullName).toBe('Wave01 DEV STUDENT 10');
 });
 it('retains internal class codes and formats them only at display sites',async()=>{
  vi.resetModules();const {presentDemoResponse,confirmDemoEnvironment,classCodeLabel}=await import('./presentation');confirmDemoEnvironment();
  const source={code:'W01-fixed-original',title:'A class'};expect(presentDemoResponse(source).code).toBe(source.code);expect(classCodeLabel(source.code)).toBe('SE-FOUNDATION-01');
 });
});
