const EXISTING = new Set(['ithfijtevbumbesizoxn','fstacjpckslamubovwms','ohzksqazcgtdeuowqagy']);
function ref(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash||!/^([a-z]{20})\.supabase\.co$/.test(parsed.hostname))throw Error('TEST_DATABASE_URL_INVALID');return parsed.hostname.split('.')[0];}
export function assertTestEnvironment({crmUrl,operationalUrl,approvedCrmRef,approvedOperationalRef,mailMode,paymentMode}){
 const crm=ref(crmUrl),operational=ref(operationalUrl);
 if(EXISTING.has(crm)||EXISTING.has(operational))throw Error('EXISTING_PROJECT_FORBIDDEN');
 if(!approvedCrmRef||!approvedOperationalRef||crm!==approvedCrmRef||operational!==approvedOperationalRef)throw Error('TEST_PROJECT_NOT_APPROVED');
 if(crm===operational)throw Error('TEST_DATABASES_MUST_BE_SEPARATE');
 if(mailMode!=='simulated'||paymentMode!=='simulated')throw Error('REAL_DELIVERY_OR_PAYMENT_FORBIDDEN');
 return Object.freeze({crmRef:crm,operationalRef:operational});
}
