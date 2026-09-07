<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.corporationId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
          <el-option v-for="o in corpOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-select v-model="query.state" placeholder="全部状态" clearable size="small" style="width: 180px" @change="load">
          <el-option v-for="s in states" :key="s" :label="s" :value="s" />
        </el-select>
        <el-input v-model="query.search" placeholder="搜索类型/星系/备注/ID" clearable size="small" style="width: 220px" @input="load" />
      </div>
      <div class="toolbar-right">
        <el-tag size="small" type="info">共 {{ total }} 个建筑</el-tag>
        <el-button size="small" @click="loadStats" :loading="statsLoading">刷新统计</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="stat-row" v-if="stats">
      <el-col :span="6"><div class="stat-card"><div class="stat-label">建筑总数</div><div class="stat-value">{{ stats.total }}</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-label">在线</div><div class="stat-value">{{ stats.byState.online || 0 }}</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-label">易损(护盾)</div><div class="stat-value warn">{{ stats.byState.shield_vulnerable || 0 }}</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-label">锚定中/解锚</div><div class="stat-value warn">{{ (stats.byState.anchoring || 0) + (stats.byState.unanchoring || 0) }}</div></div></el-col>
    </el-row>

    <el-table :data="items" style="width: 100%" :class="'dark-table'" v-loading="loading" height="calc(100vh - 320px)">
      <el-table-column prop="id" label="建筑 ID" width="160" />
      <el-table-column label="类型" min-width="180">
        <template #default="{ row }">{{ row.typeName || ('type ' + row.typeId) }}</template>
      </el-table-column>
      <el-table-column label="星系" min-width="160">
        <template #default="{ row }">{{ row.systemName || ('sys ' + row.systemId) }}</template>
      </el-table-column>
      <el-table-column label="星域" min-width="140">
        <template #default="{ row }">{{ row.regionName || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="160">
        <template #default="{ row }">
          <el-tag size="small" :type="stateType(row.state)">{{ row.state || 'unknown' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="燃料(小时)" width="110" align="right">
        <template #default="{ row }">{{ row.fuelExpiresHours != null ? row.fuelExpiresHours : '-' }}</template>
      </el-table-column>
      <el-table-column label="下次易损窗口" min-width="200">
        <template #default="{ row }">{{ row.nextVulnerableStart ? fmtDateTime(row.nextVulnerableStart) : '-' }}</template>
      </el-table-column>
      <el-table-column label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.note || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openNote(row)">备注</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        layout="prev, pager, next"
        background
        @current-change="load"
      />
    </div>

    <el-dialog v-model="noteVisible" title="建筑备注" width="440px">
      <el-input v-model="noteForm.note" type="textarea" :rows="3" placeholder="用途、归属、注意事项等" />
      <template #footer>
        <el-button @click="noteVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { structureApi, orgApi } from '../api';
import { fmtDateTime } from '../utils/format';

const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const corpOptions = ref<any[]>([]);
const stats = ref<any>(null);
const statsLoading = ref(false);
const states = ['online', 'shield_vulnerable', 'armor_vulnerable', 'hull_vulnerable', 'anchoring', 'unanchoring', 'anchor_vulnerable', 'fitting_invulnerable'];

const query = reactive({ corporationId: undefined as number | undefined, state: undefined as string | undefined, search: '', page: 1, pageSize: 50 });

const noteVisible = ref(false);
const noteForm = reactive({ id: '', note: '' });
const saving = ref(false);

onMounted(async () => {
  corpOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
  loadStats();
});

async function load() {
  loading.value = true;
  try {
    const res = await structureApi.list({
      corporationId: query.corporationId,
      state: query.state,
      search: query.search || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  try {
    stats.value = await structureApi.stats(query.corporationId);
  } finally {
    statsLoading.value = false;
  }
}

function stateType(state: string) {
  if (!state) return 'info';
  if (state.includes('vulnerable')) return 'danger';
  if (state === 'online') return 'success';
  if (state === 'anchoring' || state === 'unanchoring') return 'warning';
  return 'info';
}

function openNote(row: any) {
  noteForm.id = row.id;
  noteForm.note = row.note || '';
  noteVisible.value = true;
}

async function saveNote() {
  saving.value = true;
  try {
    await structureApi.updateNote(noteForm.id, noteForm.note);
    const row = items.value.find((i) => i.id === noteForm.id);
    if (row) row.note = noteForm.note;
    noteVisible.value = false;
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.stat-row {
  margin-bottom: 16px;
}
.stat-card {
  background: #121a33;
  border: 1px solid #1e2942;
  border-radius: 10px;
  padding: 14px 16px;
}
.stat-label {
  font-size: 12px;
  color: #7d89a8;
  margin-bottom: 6px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #4f7cff;
}
.stat-value.warn {
  color: #ffb454;
}
.dark-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: #151d3a;
  --el-table-border-color: #1e2942;
  --el-table-text-color: #c6cfe8;
  --el-table-header-text-color: #7d89a8;
  --el-table-row-hover-bg-color: #16203c;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
