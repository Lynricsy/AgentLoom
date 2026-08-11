import { describe, expect, it } from 'vitest'

import { shortenFingerprint, validatePublicKeyPem } from './developerKey'

const VALID_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkeymaterialtestkey',
  '-----END PUBLIC KEY-----',
].join('\n')

describe('validatePublicKeyPem', () => {
  it('接受首尾标记完整的 PEM 公钥（含多余空白）', () => {
    expect(validatePublicKeyPem(`\n  ${VALID_PEM}  \n`)).toBeNull()
  })

  it('空内容给出粘贴提示', () => {
    expect(validatePublicKeyPem('   ')).toContain('请粘贴')
  })

  it('私钥被单独识别，不落到通用提示', () => {
    const message = validatePublicKeyPem(
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    )

    expect(message).toContain('私钥')
  })

  it('缺少起始标记时提示 BEGIN 行', () => {
    expect(validatePublicKeyPem('MIIBIjANBgkq...')).toContain(
      '-----BEGIN PUBLIC KEY-----',
    )
  })

  it('缺少结束标记时提示 END 行', () => {
    expect(
      validatePublicKeyPem('-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq'),
    ).toContain('-----END PUBLIC KEY-----')
  })
})

describe('shortenFingerprint', () => {
  it('长指纹截取首尾片段', () => {
    expect(shortenFingerprint('a'.repeat(12) + 'b'.repeat(44) + 'c'.repeat(8))).toBe(
      `${'a'.repeat(12)}…${'c'.repeat(8)}`,
    )
  })

  it('短指纹原样返回', () => {
    expect(shortenFingerprint('abc123')).toBe('abc123')
  })
})
