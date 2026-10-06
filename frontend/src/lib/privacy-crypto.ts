const encoder = new TextEncoder()
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const MAX_VAULT_BYTES = 512 * 1024
export type Ciphertext = { iv: string; ciphertext: string }
export function generateCode(): string {
  const raw = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => alphabet[byte % 32]).join('')
  return raw.match(/.{4}/g)!.join('-')
}
export async function deriveCredentials(code: string): Promise<{ credential: string; key: CryptoKey }> {
  const normalized = code.replace(/[ -]/g, '').toUpperCase()
  if (code.length > 128 || /[^\x00-\x7f]/.test(code) || normalized.length !== 32 || [...normalized].some(symbol => !alphabet.includes(symbol))) throw new Error('Invalid private code')
  // Existing random codes contain 160 bits of entropy, not human passwords.
  // The old domain-separated digest permits migration without sending the code.
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`activity-hub:access-code:v1:${normalized}`))
  const credential = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const material = await crypto.subtle.importKey('raw', encoder.encode(normalized), 'HKDF', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('activity-hub:private-storage:v1'), info: encoder.encode('content-encryption'),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { credential, key }
}
function base64(bytes: Uint8Array<ArrayBuffer>): string {
  let value = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(value)
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  if (value.length > 4 * Math.ceil(MAX_VAULT_BYTES / 3)) throw new Error('Invalid ciphertext')
  const decoded = Uint8Array.from(atob(value), symbol => symbol.charCodeAt(0))
  if (base64(decoded) !== value) throw new Error('Invalid ciphertext')
  return decoded
}
const aad = (account: string, version: number) => encoder.encode(`activity-hub:vault:v1:${account}:${version}`)
export async function encryptVault(key: CryptoKey, account: string, version: number, content: unknown): Promise<Ciphertext> {
  const plain = encoder.encode(JSON.stringify(content))
  if (plain.byteLength + 16 > MAX_VAULT_BYTES) throw new Error('Vault storage limit reached')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(account, version), tagLength: 128 }, key, plain)
  return { iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }
}
export async function decryptVault(key: CryptoKey, account: string, version: number, box: Ciphertext): Promise<unknown> {
  const iv = bytes(box.iv)
  const ciphertext = bytes(box.ciphertext)
  if (iv.length !== 12 || ciphertext.byteLength > MAX_VAULT_BYTES || ciphertext.byteLength < 17) throw new Error('Invalid ciphertext')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(account, version), tagLength: 128 }, key, ciphertext)
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain))
}
