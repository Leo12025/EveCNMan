<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="corporationId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="generate">立即检查提醒</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
        <el-table-column prop="message" label="提醒内容" min-width="320" />
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="sevType(row.severity)">{{ sevLabel(row.severity) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.resolved ? 'success' : 'warning'">{{ row.resolved ? '已处理' : '待处理' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button v-if="!row.resolved && store.isOfficer" size="small" @click="resolve(row)">标记处理</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!items.length" class="empty">暂无提醒</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { structureAlertApi, orgApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const items = ref<any[]>([]);
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const corporationId = ref<number | undefined>(undefined);

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
});

async function load() {
  loading.value = true;
  try {
    const res = await structureAlertApi.list({ corporationId: corporationId.value, limit: 100 });
    items.value = res;
  } finally {
    loading.value = false;
  }
}

async function generate() {
  if (!corporationId.value) return ElMessage.warning('请先选择军团');
  const r = await structureAlertApi.generate(corporationId.value);
  ElMessage.success(`已生成 ${r.generated} 条提醒`);
  load();
}

async function resolve(row: any) {
  await structureAlertApi.resolve(row.id);
  ElMessage.success('已处理');
  load();
}

function sevLabel(s: string) {
  return { critical: '严重', warning: '警告', info: '提示' }[s] || s;
}
function sevType(s: string) {
  return { critical: 'danger', warning: 'warning', info: 'info' }[s] || 'info';
}
function typeLabel(t: string) {
  return { 'fuel-low': '燃料不足', vulnerable: '易损窗口', 'reinforced-end': '强化结束', 'permission-change': '权限变更' }[t] || t;
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
</style>
