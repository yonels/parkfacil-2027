import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('approval evidence blocks absent, incomplete, stale or different deployment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pf-access-'));const file=join(dir,'evidence.json');
 const run=()=>spawnSync(process.execPath,['scripts/verify-access-release.mjs',file],{env:{...process.env,ACCESS_EXPECTED_COMMIT:'commit-fixture',ACCESS_EXPECTED_ENVIRONMENT:'preview'},encoding:'utf8'}).status;
 const evidence={commit:'commit-fixture',environment:'preview',reviewedBy:'QA fixture',reviewedAt:new Date().toISOString(),checks:Object.fromEntries(['configuration','recoveryEmailReceived','qaRedirect','newPasswordLogin','expiredLinkRejected','unknownUserGenericResponse'].map(key=>[key,true]))};
 try {
 assert.equal(run(),1);
 for(const candidate of [{...evidence,checks:{}},{...evidence,commit:'other'},{...evidence,environment:'production'},{...evidence,reviewedAt:'2020-01-01'}]){await writeFile(file,JSON.stringify(candidate));assert.equal(run(),1);}
 await writeFile(file,JSON.stringify(evidence));assert.equal(run(),0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
