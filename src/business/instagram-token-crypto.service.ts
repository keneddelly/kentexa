import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Authenticated encryption for Instagram access tokens at rest.
 * The 32-byte key is supplied only through INSTAGRAM_TOKEN_ENCRYPTION_KEY
 * (64 hexadecimal characters). Never log or return plaintext tokens.
 */
@Injectable()
export class InstagramTokenCryptoService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    if (!plaintext) throw new Error('Cannot encrypt an empty Instagram token.');
    const key = this.readKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(envelope: string): string {
    const [version, ivPart, tagPart, ciphertextPart, extra] = String(envelope || '').split('.');
    if (version !== 'v1' || !ivPart || !tagPart || !ciphertextPart || extra !== undefined) {
      throw new ServiceUnavailableException('Stored Instagram token has an unsupported encryption envelope.');
    }
    try {
      const decipher = createDecipheriv(this.algorithm, this.readKey(), Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Instagram token could not be decrypted. Check the configured encryption key.');
    }
  }

  private readKey(): Buffer {
    const encoded = this.config.get<string>('INSTAGRAM_TOKEN_ENCRYPTION_KEY') || '';
    if (!/^[a-f0-9]{64}$/i.test(encoded)) {
      throw new ServiceUnavailableException('Instagram token encryption is not configured with a valid 32-byte hexadecimal key.');
    }
    return Buffer.from(encoded, 'hex');
  }
}
