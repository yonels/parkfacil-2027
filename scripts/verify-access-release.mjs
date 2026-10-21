// A signed-in test operator records evidence; secrets are never stored here.
// This verifies a QA approval record, not email delivery by itself.
import { readFile } from 'node:fs/promises';
const checks=['configuration','recoveryEmailReceived','qaRedirect','newPasswordLogin','expiredLinkRejected','unknownUserGenericResponse'];
try {
 const evidence=JSON.parse(await readFile(process.argv[2],'utf8'));
 const failures=checks.filter(key=>evidence.checks?.[key]!==true);
 if(!evidence.commit || !evidence.environment || !evidence.reviewedBy || !evidence.reviewedAt) failures.push('reviewMetadata');
 if(evidence.commit !== process.env.ACCESS_EXPECTED_COMMIT) failures.push('commitMismatch');
 if(evidence.environment !== process.env.ACCESS_EXPECTED_ENVIRONMENT) failures.push('environmentMismatch');
 const age=Date.now()-Date.parse(evidence.reviewedAt);
 if(!Number.isFinite(age)||age<0||age>24*60*60*1000) failures.push('staleReview');
 if(failures.length) throw new Error(failures.join(', '));
 console.log('[access-release] Approved evidence for the specified commit/environment.');
} catch { console.error('[access-release] BLOCKED: missing, incomplete or stale QA evidence.');process.exitCode=1; }
