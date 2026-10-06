import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCode, deriveCredentials, encryptVault, decryptVault } from '../src/lib/privacy-crypto'

beforeEach(() => vi.stubGlobal('crypto', webcrypto))
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
describe('Cifrado del contenido en el navegador', () => {
  it('genera códigos de alta entropía y separa la credencial de acceso de la clave no exportable', async () => {
    const code = generateCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){7}$/)
    const first = await deriveCredentials(code)
    const same = await deriveCredentials(code.replaceAll('-', '').toLowerCase())
    expect(first.credential).toMatch(/^[a-f0-9]{64}$/)
    expect(first.credential).toBe(same.credential)
    expect(first.key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', first.key)).rejects.toThrow()
    await expect(deriveCredentials('contraseña elegida por una persona')).rejects.toThrow()
  })
  it('cifra también fechas y reintentos; detecta otra cuenta, versión, clave o bytes manipulados', async () => {
    const { key } = await deriveCredentials(generateCode())
    const content = { title: 'Contenido privado sintético', date: '2026-10-06', replay: 'respuesta privada' }
    const box = await encryptVault(key, account, 1, content)
    expect(JSON.stringify(box)).not.toContain(content.title)
    expect(JSON.stringify(box)).not.toContain(content.date)
    expect(await decryptVault(key, account, 1, box)).toEqual(content)
    const other = await deriveCredentials(generateCode())
    await expect(decryptVault(other.key, account, 1, box)).rejects.toThrow()
    await expect(decryptVault(key, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, box)).rejects.toThrow()
    await expect(decryptVault(key, account, 2, box)).rejects.toThrow()
    await expect(decryptVault(key, account, 1, { ...box, ciphertext: `${box.ciphertext[0] === 'A' ? 'B' : 'A'}${box.ciphertext.slice(1)}` })).rejects.toThrow()
    expect((await encryptVault(key, account, 1, content)).iv).not.toBe(box.iv)
  })
})
