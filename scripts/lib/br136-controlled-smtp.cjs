'use strict';
// Demo operator seam around the existing EmailSender, not a second mail adapter.
const fs=require('node:fs'),path=require('node:path');
function loadPolicy(directory,machineBinding){
 const file=path.join(directory,'smtp.private.json');
 if(!fs.existsSync(file))return null;
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 if(p.approvalId!=='BR136_SMTP_CORE_20261112_01'||p.machineBinding!==machineBinding||p.databaseOid!=='1313121'||p.maximumMessages!==1||!p.enabled||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now()||Date.parse(p.expiresAt)-Date.parse(p.approvedAt)>86400000)throw Error('SMTP_CONTROLLED_POLICY_REQUIRED');
 if(p.config?.SMTP_HOST!=='smtp-relay.brevo.com'||p.config.SMTP_PORT!=='587'||p.config.SMTP_SECURE!=='false'||p.config.EMAIL_PROVIDER!=='smtp'||!p.config.SMTP_USER||!p.config.SMTP_PASSWORD||!p.config.EMAIL_FROM||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.recipient)||p.recipient!==p.recipient.toLowerCase())throw Error('SMTP_CONTROLLED_CONFIG_REQUIRED');
 return p;
}
function createControlledEmailSender({directory,machineBinding,delegate}){
 const initial=loadPolicy(directory,machineBinding);if(!initial)throw Error('SMTP_PRIVATE_CONFIG_ABSENT');
 return {async send(message){
  const p=loadPolicy(directory,machineBinding);
  if(!p||message.to!==p.recipient||message.subject!=='Đặt lại mật khẩu Smart English'||!message.text.includes('http://127.0.0.1:5173/reset-password#token=')||!message.html.includes('http://127.0.0.1:5173/reset-password#token='))throw Error('SMTP_CONTROLLED_RECIPIENT_OR_MESSAGE_BLOCKED');
  // O_EXCL reservation is durable before SMTP; failure/crash never refunds it.
  const claim=path.join(directory,p.approvalId+'.used.json');let fd;
  try{fd=fs.openSync(claim,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({approvalId:p.approvalId,reservedAt:new Date().toISOString(),databaseOid:'1313121',maximumMessages:1,recipientSaved:false,messageSaved:false}));fs.fsyncSync(fd);}finally{if(fd!==undefined)fs.closeSync(fd);}
  try{await delegate.send(message);fs.appendFileSync(path.join(directory,'delivery-events.jsonl'),JSON.stringify({at:new Date().toISOString(),relayAccepted:true,inboxDeliveryVerified:false,contentSaved:false})+'\n');}
  catch{fs.appendFileSync(path.join(directory,'delivery-events.jsonl'),JSON.stringify({at:new Date().toISOString(),relayAccepted:false,automaticRetry:false,contentSaved:false})+'\n');throw Error('SMTP_DELIVERY_FAILED_NO_AUTOMATIC_RETRY');}
 }};
}
module.exports={loadPolicy,createControlledEmailSender};
