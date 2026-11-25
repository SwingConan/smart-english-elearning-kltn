import type { Prisma } from '../../generated/prisma/client';
import { verifyUnifiedTarget } from '../operations/unified-runtime.guard';

// Row IDs verified against the preserved QA inventory and original provisioning
// records. This is a read projection, not an unpublish, rename or DB mutation.
// DEC071 approves an internal QA version; it does not make its fixture catalog public.
export const INTERNAL_QA_COURSE_IDS = [
  '0f7966c8-76ff-4451-9251-3768c67a78b5',
  '37f7cd56-51e2-4bf0-bda0-f68155059042',
  'c66bdf35-20f6-4431-a715-e3c170eaf020',
  'db03894e-6b2e-4293-b1e3-0e2d9bb1e926',
  'ed637260-2624-47c0-850d-269a0992dbdd',
  '1921840d-8fd0-4f16-981c-70ea7de99c2d',
  'aa0e2edb-6d84-4ac0-940f-5bc9a4677e92',
  '3978e97b-d15f-442a-b347-fbccbd3b403d',
  '5b73082d-3baf-4867-9f21-5730935faa35',
  '1c1df3f2-f1b2-4072-8cf1-10ebcb662d14',
  '5dbf15a0-0c23-48f7-9d94-c823b0c95b57',
  '80a56e7b-3059-49bb-afdc-d295cb7584d5',
  '8247560c-3e0d-43f3-84aa-9c422f72dbc1',
  'f7e9f988-0026-4fed-acc0-3f2a0722e286',
  '1c74d3c6-e9c3-45fe-9229-0737921f5736',
  '34aacda1-f0de-46b8-9ba7-78fa9304a15b',
  '350e7120-1f4e-4a4b-ae38-6dd960c5e15f',
  '9422f714-f4d7-480e-ba15-e86cbfc36093',
  'b4bbcc45-4d4b-4e6f-be0b-224126bc8b69',
] as const;

export async function publicQaCatalogScope(
  tx: Prisma.TransactionClient,
): Promise<Prisma.CourseWhereInput> {
  if (process.env.V2_UNIFIED_RUNTIME !== 'DEV_UNIFIED_01') return {};
  const identity = await verifyUnifiedTarget(tx);
  if (identity.oid !== '953322') return {};
  return { id: { notIn: [...INTERNAL_QA_COURSE_IDS] } };
}
