import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * OAuth token 加密存储服务（AES-256-GCM）。
 * - 密钥来自环境变量 TOKEN_ENC_KEY（base64 32 字节），缺失时回退到由
 *   APP_SECRET / 主机名派生的开发密钥（仅用于本地，生产必须配置 TOKEN_ENC_KEY）。
 * - 每个密文使用独立随机 IV 与 GCM auth tag，格式：iv(12) | tag(16) | ciphertext。
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;
  private readonly alg = 'aes-256-gcm';

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('TOKEN_ENC_KEY') || this.config.get<string>('APP_SECRET');
    if (raw) {
      // 允许直接使用 32 字节 base64 / hex，或任意口令（派生）
      this.key = this.deriveKey(raw);
    } else {
      this.logger.warn('未配置 TOKEN_ENC_KEY / APP_SECRET，token 将使用由主机名派生的临时密钥（重启后旧密文无法解密）。生产环境请配置 TOKEN_ENC_KEY。');
      this.key = this.deriveKey(require('os').hostname() + 'eveman-dev');
    }
  }

  private deriveKey(seed: string): Buffer {
    try {
      const buf = Buffer.from(seed, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      /* fallthrough */
    }
    try {
      const hex = Buffer.from(seed, 'hex');
      if (hex.length === 32) return hex;
    } catch {
      /* fallthrough */
    }
    return scryptSync(seed, 'eveman-salt', 32);
  }

  encrypt(plain: string): string {
    if (plain == null) return plain as any;
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.alg, this.key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(stored: string): string {
    if (stored == null) return stored as any;
    const buf = Buffer.from(stored, 'base64');
    if (buf.length < 28) return stored; // 非加密旧值，原样返回
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    try {
      const decipher = createDecipheriv(this.alg, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
      // 解密失败（密钥不匹配/旧格式）原样返回，避免崩溃
      return stored;
    }
  }
}
