/**
 * Self-check for the SBPDCL envelope crypto.
 *
 * Verifies the browser libs (crypto-js / jsencrypt) produce exactly what the
 * service accepts, by decrypting with Node's crypto the way the server would.
 * Run: node src/utils/sbpdclApi.test.mjs
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import CryptoJS from 'crypto-js';

const BOOTSTRAP_PASSPHRASE = 'fgwebcp@2020';

// OpenSSL EVP_BytesToKey(MD5) — how a server reads CryptoJS passphrase output.
function evpKDF(pass, salt, keyLen = 32, ivLen = 16) {
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    block = crypto.createHash('md5')
      .update(Buffer.concat([block, Buffer.from(pass, 'binary'), salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

// 1. Bootstrap AES (static passphrase) must round-trip through the OpenSSL format.
{
  const plaintext = JSON.stringify({ action: 'getAllWebConfigurations' });
  const cipher = CryptoJS.AES.encrypt(plaintext, BOOTSTRAP_PASSPHRASE).toString();

  const raw = Buffer.from(cipher, 'base64');
  assert.strictEqual(raw.subarray(0, 8).toString(), 'Salted__', 'expected OpenSSL "Salted__" envelope');
  const { key, iv } = evpKDF(BOOTSTRAP_PASSPHRASE, raw.subarray(8, 16));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8');

  assert.strictEqual(decrypted, plaintext, 'bootstrap AES did not round-trip');
}

// 2. Hybrid envelope: RSA-wrapped key + AES-CBC payload, both server-readable.
{
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  const action = { action: 'fgexternal/rest/prepaid/walletBalance/123', method: 'GET', auth: 'TOKEN', baseUrlName: '' };
  const plaintext = JSON.stringify(action);

  // Mirror encryptHybrid() exactly.
  const aesKey = CryptoJS.lib.WordArray.random(32);
  const iv = CryptoJS.lib.WordArray.random(16);
  const payload = CryptoJS.AES.encrypt(plaintext, aesKey, {
    iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
  }).toString();

  // Node cannot resolve jsencrypt's ESM entry (extensionless imports); Vite can,
  // so the app uses it directly and only this check reaches for the CJS bundle.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const bundle = require(
    path.join(path.dirname(require.resolve('jsencrypt/package.json')), 'bin', 'jsencrypt.min.js')
  );
  const JSEncrypt = bundle.JSEncrypt ?? bundle; // UMD bundle exports the constructor itself
  const rsa = new JSEncrypt();
  rsa.setPublicKey(publicB64);
  const encryptedKey = rsa.encrypt(aesKey.toString(CryptoJS.enc.Hex));
  assert.ok(encryptedKey, 'RSA encryption returned nothing');

  // Server side: unwrap the key, then the payload.
  const keyHex = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(encryptedKey, 'base64')
  ).toString('utf8');
  assert.strictEqual(keyHex.length, 64, 'AES key should be 32 bytes as 64 hex chars');

  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyHex, 'hex'), Buffer.from(iv.toString(CryptoJS.enc.Hex), 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  assert.strictEqual(decrypted, plaintext, 'hybrid payload did not round-trip');
}

console.log('sbpdclApi crypto self-check: OK');
