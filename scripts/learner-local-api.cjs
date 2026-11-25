'use strict';
// Local learner endpoints. Never restart or change the API serving the public site.
const path=require('node:path');
const C=require('./lib/br136-launcher-config.cjs');
Object.assign(process.env,{DATABASE_URL:'postgresql://wave01@127.0.0.1:55401/'+C.DATABASE,E2E_DATABASE_URL:'postgresql://wave01@127.0.0.1:55401/'+C.DATABASE,NODE_ENV:'development',WEB_ORIGIN:'http://127.0.0.1:5173',W06_ENABLED:'DEV_DEC047',W05A_ENABLED:'DEV_SUPPORT',W05B_ENABLED:'DEV_DEC060'});
require('ts-node').register({transpileOnly:true,project:path.join(C.ROOT,'apps/api/tsconfig.json')});
Object.assign(process.env,{W04B_ENABLED:'DEV_WORKFLOW',PLACEMENT_INTERNAL_RELEASE:'PO_INTERNAL_20261113',GEMINI_ADVISORY_MODEL:'gemini-3.5-flash-lite',PLACEMENT_AI_ADVISORY_PROVIDER:process.env.GEMINI_API_KEY?'GEMINI':'NONE',PLACEMENT_AI_ADVISORY_STAGING_ENABLED:process.env.GEMINI_API_KEY?'true':'false',PLACEMENT_AI_ADVISORY_LIVE_VERIFIED:process.env.GEMINI_API_KEY?'true':'false',PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS:Number(process.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS)>0?process.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS:'50',PLACEMENT_AI_ADVISORY_TIMEOUT_MS:Number(process.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS)>0?process.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS:'25000',ASSESSMENT_STIMULUS_AUTHORED_ROOT:path.join(C.ROOT,'.local-storage/v2-wave01/dev-media'),ASSESSMENT_STIMULUS_MEDIA_ROOT:path.join(C.ROOT,'.local-storage/v2-wave01/dev-media'),SEPAY_CONFIG_FILE:path.join(C.ROOT,'.local-storage/v2-w07-sepay-fullstack-01/sepay-config.private.json')});
const {Module}=require('@nestjs/common'),{NestFactory,APP_GUARD}=require('@nestjs/core'),{ConfigModule,ConfigService}=require('@nestjs/config');
const {PrismaModule}=require('../apps/api/src/infrastructure/prisma/prisma.module.ts');
const {SessionModule}=require('../apps/api/src/infrastructure/session/session.module.ts');
const {UsersModule}=require('../apps/api/src/modules/users/users.module.ts');
const {AuthGuard}=require('../apps/api/src/modules/auth/guards/auth.guard.ts');
const {RolesGuard}=require('../apps/api/src/modules/auth/guards/roles.guard.ts');
const {AuthorizationGuard}=require('../apps/api/src/modules/authorization/authorization.guard.ts');
const {AuthorizationService}=require('../apps/api/src/modules/authorization/authorization.service.ts');
const {AuthorizationModule}=require('../apps/api/src/modules/authorization/authorization.module.ts');
const {TuitionModule}=require('../apps/api/src/modules/tuition/tuition.module.ts');
const {LearnerFinanceModule}=require('../apps/api/src/modules/learner/learner-finance.module.ts');
const {ClassDashboardController}=require('../apps/api/src/modules/class-lms/class-lms.controller.ts');
const {ClassDashboardService}=require('../apps/api/src/modules/class-lms/class-dashboard.service.ts');
const {ClassLmsService}=require('../apps/api/src/modules/class-lms/class-lms.service.ts');
const {LearningResourceStorage,LocalLearningResourceStorage}=require('../apps/api/src/modules/learning/learning-resource.storage.ts');
const {SupportModule}=require('../apps/api/src/modules/support/support.module.ts');
const {ConsultationsModule}=require('../apps/api/src/modules/consultations/consultations.module.ts');
const {PlacementIntegrationController}=require('../apps/api/src/modules/placement/integration.controller.ts');
const {PlacementIntegrationService}=require('../apps/api/src/modules/placement/integration.service.ts');
const {PlacementWorkflowController}=require('../apps/api/src/modules/placement/workflow.controller.ts');
const {PlacementWorkflowService}=require('../apps/api/src/modules/placement/workflow.service.ts');
const {LmsLocalController}=require('../apps/api/src/modules/class-lms/lms-local.controller.ts');
const {LmsLocalService}=require('../apps/api/src/modules/class-lms/lms-local.service.ts');
const {AssessmentResponseStorage,LocalAssessmentResponseStorage}=require('../apps/api/src/modules/placement/assessment-response.storage.ts');
const {AssessmentStimulusMediaStorage}=require('../apps/api/src/modules/placement/assessment-stimulus-media.storage.ts');
const {configureHttpApplication}=require('../apps/api/src/app.setup.ts');
class LocalLearnerModule{}
Module({imports:[ConfigModule.forRoot({isGlobal:true}),PrismaModule,SessionModule,UsersModule,AuthorizationModule,TuitionModule,LearnerFinanceModule,SupportModule,ConsultationsModule],controllers:[ClassDashboardController,PlacementIntegrationController,PlacementWorkflowController,LmsLocalController],providers:[ClassDashboardService,ClassLmsService,LmsLocalService,PlacementIntegrationService,PlacementWorkflowService,AssessmentStimulusMediaStorage,{provide:AssessmentResponseStorage,useClass:LocalAssessmentResponseStorage},LocalLearningResourceStorage,{provide:LearningResourceStorage,useExisting:LocalLearningResourceStorage},AuthorizationService,{provide:APP_GUARD,useClass:AuthGuard},{provide:APP_GUARD,useClass:AuthorizationGuard},{provide:APP_GUARD,useClass:RolesGuard}]})(LocalLearnerModule);
(async()=>{
 const {Client}=require('pg'),db=new Client({connectionString:process.env.DATABASE_URL});
 try{await db.connect();await db.query('BEGIN READ ONLY');await db.query('SELECT br136_bank_check.assert_target()');await db.query('ROLLBACK');}finally{await db.end();}
 const app=await NestFactory.create(LocalLearnerModule,{logger:['error']});
 app.use((_req,res,next)=>{res.setHeader('X-Smart-English-Environment','demo');next();});
 configureHttpApplication(app,app.get(ConfigService));
 await app.listen(3001,'127.0.0.1');
 console.log('LOCAL_LEARNER_READ_API_READY_3001');
 process.once('SIGINT',()=>void app.close());process.once('SIGTERM',()=>void app.close());
})().catch(e=>{console.error('LOCAL_LEARNER_API_FAILED: '+e.message);process.exitCode=1;});
