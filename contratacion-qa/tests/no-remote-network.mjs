// Fail closed: HTTP tests must never contact Auth, CRM, storage or any remote service.
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin!=='http://127.0.0.1:14320')throw Error('REMOTE_NETWORK_FORBIDDEN_IN_TEST');
 return originalFetch(input,options);
};
