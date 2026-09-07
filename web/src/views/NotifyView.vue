<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="通知列表" name="list">
        <div class="panel">
          <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
            <el-table-column prop="title" label="标题" min-width="180">
              <template #default="{ row }">
                <span :class="{ unread: !row.read }">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="body" label="内容" min-width="280" show-overflow-tooltip />
            <el-table-column label="渠道" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="channelType(row.channel)">{{ channelLabel(row.channel) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'sent' ? 'success' : row.status === 'failed' ? 'danger' : 'info'">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button v-if="!row.read" size="small" @click="markRead(row)">标已读</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="total, prev, pager, next" class="pager" @current-change="onPage" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="Webhook 配置" name="configs">
        <div class="toolbar">
          <div class="toolbar-right">
            <el-button v-if="store.isAdmin" size="small" type="primary" plain @click="configVisible = true">新增 Webhook</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="configs" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="name" label="名称" min-width="130" />
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.type.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="url" label="地址" min-width="260" show-overflow-tooltip />
            <el-table-column prop="events" label="事件" width="140">
              <template #default="{ row }">{{ row.events === '*' ? '全部' : row.events }}</template>
            </el-table-column>
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button v-if="store.isAdmin" size="small" type="danger" plain @click="removeConfig(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!configs.length" class="empty">暂无 Webhook 配置</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增 webhook -->
    <el-dialog v-model="configVisible" title="新增 Webhook" width="480px">
      <el-form :model="configForm" label-width="90px">
        <el-form-item label="名称" required><el-input v-model="configForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="configForm.type" style="width: 100%">
            <el-option label="Discord" value="discord" />
            <el-option label="QQ 机器人" value="qq" />
            <el-option label="企业微信" value="wechat" />
            <el-option label="Slack" value="slack" />
          </el-select>
        </el-form-item>
        <el-form-item label="Webhook 地址" required><el-input v-model="configForm.url" /></el-form-item>
        <el-form-item label="触发事件">
          <el-input v-model="configForm.events" placeholder="tax,srp,ping,structure 或 *" />
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="configForm.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" @click="doConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { notifyApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('list');
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);
const configs = ref<any[]>([]);
const configVisible = ref(false);
const configForm = reactive({ name: '', type: 'discord', url: '', events: '*', enabled: true });

onMounted(() => {
  load();
  loadConfigs();
});

async function load() {
  loading.value = true;
  try {
    const res = await notifyApi.list(page.value);
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadConfigs() {
  configs.value = await notifyApi.configs();
}

function onPage(p: number) {
  page.value = p;
  load();
}

async function markRead(row: any) {
  await notifyApi.markRead(row.id);
  row.read = true;
}

async function doConfig() {
  if (!configForm.name || !configForm.url) return ElMessage.warning('请填写必填项');
  await notifyApi.upsertConfig(configForm);
  ElMessage.success('Webhook 已保存');
  configVisible.value = false;
  loadConfigs();
}

async function removeConfig(row: any) {
  await ElMessageBox.confirm('确认删除该 Webhook？', '删除配置');
  await notifyApi.removeConfig(row.id);
  ElMessage.success('已删除');
  loadConfigs();
}

function channelLabel(c: string) {
  return { inapp: '站内信', webhook: 'Webhook', discord: 'Discord', qq: 'QQ', wechat: '微信' }[c] || c;
}
function channelType(c: string) {
  return { inapp: 'info', webhook: 'warning', discord: 'primary', qq: 'success', wechat: 'success' }[c] || 'info';
}
function statusLabel(s: string) {
  return { pending: '待发送', sent: '已发送', failed: '失败' }[s] || s;
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.unread { color: #eef2ff; font-weight: 600; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
