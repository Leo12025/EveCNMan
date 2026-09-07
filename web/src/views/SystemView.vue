<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">Token 安全加密</div>
          <div class="sec-item">
            <div class="sec-desc">
              ESI OAuth token 以 AES-256-GCM 加密存储。历史明文 token 可执行一次迁移加密（需配置 TOKEN_ENC_KEY / APP_SECRET 后生效）。
            </div>
            <el-button type="primary" plain size="small" @click="encryptLegacy">迁移加密历史 Token</el-button>
            <div v-if="migrateResult" class="sec-result">迁移完成：{{ migrateResult.migrated }} 条</div>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">数据库备份</div>
          <div class="sec-item">
            <div class="sec-desc">将数据库文件 gzip 压缩到 backups 目录，可随时恢复。</div>
            <el-button type="primary" size="small" @click="doBackup" :loading="backing">立即备份</el-button>
            <div v-if="backupResult" class="sec-result">备份完成：{{ backupResult.file }}（{{ (backupResult.size / 1024).toFixed(1) }} KB）</div>
          </div>
          <div class="backup-list">
            <div v-for="b in backups" :key="b.name" class="backup-item">
              <span>{{ b.name }}</span>
              <span class="muted">{{ (b.size / 1024).toFixed(1) }} KB · {{ new Date(b.createdAt).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="panel" style="margin-top: 16px">
      <div class="panel-title">安全说明</div>
      <div class="sec-desc">
        1. 生产环境务必在 <code>.env</code> 中配置 <code>TOKEN_ENC_KEY</code>（32 字节 base64），否则重启后旧密文无法解密。<br />
        2. 敏感操作（打款、SRP 发放）均需管理员二次确认。<br />
        3. 日志保留策略与备份周期建议按组织规章配置。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { systemApi } from '../api';

const backing = ref(false);
const backupResult = ref<any>(null);
const backups = ref<any[]>([]);
const migrateResult = ref<any>(null);

onMounted(async () => {
  backups.value = await systemApi.backups();
});

async function doBackup() {
  backing.value = true;
  try {
    backupResult.value = await systemApi.backup();
    ElMessage.success('备份完成');
    backups.value = await systemApi.backups();
  } finally {
    backing.value = false;
  }
}

async function encryptLegacy() {
  await ElMessageBox.confirm('确认将历史明文 Token 迁移为 AES 加密存储？请先确认已配置 TOKEN_ENC_KEY。', 'Token 迁移');
  migrateResult.value = await systemApi.encryptLegacyTokens();
  ElMessage.success('迁移完成');
}
</script>

<style scoped>
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.panel-title { font-size: 14px; font-weight: 600; color: #c6cfe8; margin-bottom: 12px; }
.sec-item { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.sec-desc { font-size: 13px; color: #7d89a8; line-height: 1.7; }
.sec-result { font-size: 13px; color: #46a758; }
.backup-list { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
.backup-item { display: flex; justify-content: space-between; font-size: 12px; color: #c6cfe8; background: #0f1630; padding: 8px 12px; border-radius: 6px; }
.muted { color: #5b6780; }
code { background: #0f1630; padding: 1px 6px; border-radius: 4px; color: #4f7cff; }
</style>
