import {BUSINESS_ROLES,eligible,inherent}from '../authorization/permission.policy';
import {AuthorizationService}from '../authorization/authorization.service';
import type {PrismaService}from '../../infrastructure/prisma/prisma.service';
import type {Prisma}from '../../generated/prisma/client';
describe('W08 scoped approval policy — offline unit only',()=>{
 const caps=['inspection.assign','inspection.hours.review','shift.review'];
 it.each(BUSINESS_ROLES)('%s has no inherent W08 business approval',role=>{
  for(const c of caps){expect(eligible(role,c)).toBe(role==='ACADEMIC_MANAGER');expect(inherent(role,c)).toBe(false);}
 });
 it.each(caps)('%s excludes GLOBAL grants and checks active approved unrevoked CLASS grant',async cap=>{
  const findFirst=jest.fn().mockResolvedValue(null),tx={user:{findUnique:jest.fn().mockResolvedValue({role:'ACADEMIC_MANAGER',status:'ACTIVE'})},$queryRaw:jest.fn().mockResolvedValue([{ms:1000000}]),permissionGrant:{findFirst}};
  const service=new AuthorizationService({}as PrismaService);
  expect(await service.permits('hvu',cap,{type:'CLASS',id:'own-class'},tx as unknown as Prisma.TransactionClient)).toBe(false);
  expect(findFirst).toHaveBeenCalledWith({where:expect.objectContaining({capability:cap,revokedAt:null,OR:[{scopeType:'CLASS',scopeId:'own-class'}]})});
 });
});
