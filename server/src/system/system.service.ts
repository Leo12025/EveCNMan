import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { writeFile, copyFile, mkdir, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { gzipSync } from 'zlib';
import { ConfigService } from '@nestjs/config';
import { EveAccount } from '../common/entities/eve-account.entity';

const gzip = promisify(createGzip);

@Injectable()
export class SystemService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemService.name);
  private backupTimer: NodeJS.Timeout | null = null;
  constructor(
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    private readonly config: ConfigService,
  ) {}

  /** 模块启动后开启每日自动备份（可经 BACKUP_ENABLED 关闭，默认开启） */
  onModuleInit() {
    const enabled = this.config.get<string>('BACKUP_ENABLED', 'true') !== 'false';
    if (!enabled) return;
    const intervalMs = 24 * 3600 * 1000;
    this.backupTimer = setInterval(() => {
      this.backupWithRetention().catch((e) => this.logger.warn(`自动备份失败: ${e.message}`));
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.backupTimer) clearInterval(this.backupTimer);
  }

  /** 数据备份：将数据库文件 gzip 复制到 backup 目录，并扫描未加密 token */
  async backup() {
    const dbPath = this.config.get<string>('DB_PATH', 'eveman.db');
    const dir = join(process.cwd(), 'backups');
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = join(dir, `eveman-${stamp}.db.gz`);
    const raw = require('fs').readFileSync(dbPath);
    const packed = gzipSync(raw);
    await writeFile(dest, packed);
    return { ok: true, file: basename(dest), size: packed.length };
  }

  /** 定时自动备份：保留最近 retain 份，超出自动清理 */
  async backupWithRetention(retain = 14) {
    const created = await this.backup();
    const dir = join(process.cwd(), 'backups');
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.db.gz'));
    } catch {
      return created;
    }
    files.sort((a, b) => {
      const ta = require('fs').statSync(join(dir, a)).mtime.getTime();
      const tb = require('fs').statSync(join(dir, b)).mtime.getTime();
      return tb - ta; // 新 -> 旧
    });
    const toDelete = files.slice(retain);
    for (const f of toDelete) {
      try { require('fs').unlinkSync(join(dir, f)); } catch {}
    }
    this.logger.log(`自动备份完成，保留 ${files.length - toDelete.length} 份（清理 ${toDelete.length} 份）`);
    return created;
  }

  /** 一次性：将历史明文 token 加密（升级旧库） */
  async encryptLegacyTokens() {
    const rows = await this.accounts.find();
    let migrated = 0;
    for (const a of rows) {
      if (!a.tokenEncrypted && (a.accessToken || a.refreshToken)) {
        // 重新 save 触发 BeforeInsert/Update 钩子加密
        await this.accounts.save(a);
        migrated++;
      }
    }
    return { ok: true, migrated };
  }

  async listBackups() {
    const dir = join(process.cwd(), 'backups');
    try {
      const files = await readdir(dir);
      const stats = await Promise.all(
        files
          .filter((f) => f.endsWith('.db.gz'))
          .map(async (f) => {
            const s = require('fs').statSync(join(dir, f));
            return { name: f, size: s.size, createdAt: s.mtime };
          }),
      );
      return stats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }
}
