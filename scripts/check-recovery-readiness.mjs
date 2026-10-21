import nextEnv from '@next/env';
import { recoveryReadiness } from '../src/lib/passwordRecoveryReadiness.mjs';
nextEnv.loadEnvConfig(process.cwd());
if(process.argv.includes('--vercel-only') && process.env.VERCEL !== '1') {
 console.log('[access-readiness] Local build: run npm run check:access for environment validation.');
} else {
 const result = recoveryReadiness();
 if (!result.ok) { console.error('[access-readiness] BLOCKED',result.problems.join(', ')); process.exitCode=1; }
 else console.log('[access-readiness] Configuration present. Real delivery/login validation is still required.');
}
