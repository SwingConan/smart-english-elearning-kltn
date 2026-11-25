import { publicQaCatalogScope, INTERNAL_QA_COURSE_IDS } from './qa-catalog.policy';
import { verifyUnifiedTarget } from '../operations/unified-runtime.guard';
import type { Prisma } from '../../generated/prisma/client';
jest.mock('../operations/unified-runtime.guard',()=>({verifyUnifiedTarget:jest.fn()}));
describe('integrated QA catalog projection',()=>{
  const previous=process.env.V2_UNIFIED_RUNTIME;
  afterEach(()=>{if(previous===undefined)delete process.env.V2_UNIFIED_RUNTIME;else process.env.V2_UNIFIED_RUNTIME=previous;jest.clearAllMocks();});
  it('does not change catalogs outside the integrated QA mode',async()=>{
    delete process.env.V2_UNIFIED_RUNTIME;
    expect(await publicQaCatalogScope({} as Prisma.TransactionClient)).toEqual({});
    expect(verifyUnifiedTarget).not.toHaveBeenCalled();
  });
  it('uses verified row provenance for the exact target, not title replacement',async()=>{
    process.env.V2_UNIFIED_RUNTIME='DEV_UNIFIED_01';
    (verifyUnifiedTarget as jest.Mock).mockResolvedValue({oid:'953322'});
    expect(await publicQaCatalogScope({} as Prisma.TransactionClient)).toEqual({id:{notIn:[...INTERNAL_QA_COURSE_IDS]}});
    expect(INTERNAL_QA_COURSE_IDS).toHaveLength(19);
    expect(INTERNAL_QA_COURSE_IDS).not.toContain('f182af92-87f1-4800-8d6d-bde9b3d1c21a');
  });
  it('propagates an identity guard failure instead of reading fallback data',async()=>{
    process.env.V2_UNIFIED_RUNTIME='DEV_UNIFIED_01';
    (verifyUnifiedTarget as jest.Mock).mockRejectedValue(new Error('UNIFIED_TARGET_IDENTITY_REQUIRED'));
    await expect(publicQaCatalogScope({} as Prisma.TransactionClient)).rejects.toThrow('UNIFIED_TARGET_IDENTITY_REQUIRED');
  });
});
