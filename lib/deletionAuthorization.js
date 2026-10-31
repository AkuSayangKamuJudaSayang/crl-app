import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { checkAccountPassword, isLoginLocked } from './loginSecurity';
import { matchingDeletionStatement, statementBytes } from './deletionStatement.mjs';

const secret = () => crypto.createHmac('sha256', process.env.JWT_SECRET || process.env.AUTH_SECRET).update('crl-deletion-certificate-v1').digest();
const stamp = user => crypto.createHmac('sha256', secret()).update(`${user.id}:${user.passwordHash}`).digest('hex');
const authorizationError = () => Object.assign(new Error('Confirm your account password to authorize this deletion. Pending changes remain saved.'), { status: 409, code: 'DELETION_AUTH_REQUIRED' });

export async function requireDeletionPassword(db, userId, password) {
  if (typeof password !== 'string' || !password || password.length > 1024) throw Object.assign(new Error('Enter your account password.'), {status:400});
  const checked = await checkAccountPassword(db, userId, password);
  if (checked.locked) throw Object.assign(new Error(checked.locked.error), {status:423, payload:checked.locked});
  if (!checked.valid) throw Object.assign(new Error(`Incorrect account password.${checked.attempts_remaining ? ` ${checked.attempts_remaining} attempts remaining.` : ''}`), {status:403});
  return checked.user;
}

export function createDeletionCertificate(user, publicKey) {
  if (publicKey?.kty !== 'EC' || publicKey.crv !== 'P-256' || publicKey.d || typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string') throw Object.assign(new Error('Invalid confirmation key.'), {status:400});
  // Import once on issuance to reject malformed points before signing them.
  crypto.createPublicKey({key:publicKey, format:'jwk'});
  const pub = {kty:'EC',crv:'P-256',x:publicKey.x,y:publicKey.y};
  return jwt.sign({purpose:'learner-deletion',userId:Number(user.id),passwordStamp:stamp(user),publicKey:pub},secret(),{algorithm:'HS256',audience:'crl-deletion',expiresIn:'30d'});
}

export async function verifyDeletionAuthorization(db, userId, action, body, learners) {
  try {
    const proof = body?.deletion_authorization;
    if (!proof || typeof proof.certificate !== 'string' || proof.certificate.length > 4096 || typeof proof.signature !== 'string' || proof.signature.length > 256) throw Error();
    const claim = jwt.verify(proof.certificate,secret(),{algorithms:['HS256'],audience:'crl-deletion'});
    if (claim.purpose !== 'learner-deletion' || claim.userId !== Number(userId)) throw Error();
    const user = await db.user.findUnique({where:{id:Number(userId)}});
    if (!user || !['teacher','admin'].includes(user.role) || isLoginLocked(user) || claim.passwordStamp !== stamp(user)) throw Error();
    if (!matchingDeletionStatement(proof.statement,action,body,learners)) throw Error();
    const publicKey = crypto.createPublicKey({key:claim.publicKey,format:'jwk'});
    if (!crypto.verify('sha256',statementBytes(proof.statement),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(proof.signature,'base64url'))) throw Error();
  } catch { throw authorizationError(); }
}
