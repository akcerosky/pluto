import { adminAuth } from '../lib/firebaseAdmin.js';
const args = process.argv.slice(2);
const findArg = (prefix) => args.find((arg) => arg.startsWith(`${prefix}=`))?.split('=').slice(1).join('=');
const uidArg = findArg('--uid');
const emailArg = findArg('--email');
const main = async () => {
    if (!uidArg && !emailArg) {
        throw new Error('Provide either --uid=<uid> or --email=<email>.');
    }
    let uid = uidArg;
    if (!uid && emailArg) {
        const user = await adminAuth.getUserByEmail(emailArg);
        uid = user.uid;
    }
    if (!uid) {
        throw new Error('Unable to resolve a Firebase UID.');
    }
    await adminAuth.setCustomUserClaims(uid, { admin: true });
    console.log(`Admin custom claim granted to ${uid}`);
};
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
