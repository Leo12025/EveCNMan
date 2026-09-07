<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadAll">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-input v-model="query.search" placeholder="搜索物品名" clearable size="small" style="width: 180px" @input="load" />
      </div>
      <div class="toolbar-right">
        <el-button v-if="store.isAdmin" size="small" type="primary" plain @click="syncAssets">同步资产</el-button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">资产总价值</div>
        <div class="value">{{ fmtIsk(summary.totalValue) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">资产条目</div>
        <div class="value">{{ fmtNumber(summary.count) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">物品种类</div>
        <div class="value">{{ fmtNumber(summary.typeCount) }}</div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">位置分布</div>
          <el-table :data="summary.byLocation" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="location" label="位置" />
            <el-table-column prop="count" label="条目" width="80" align="right" />
            <el-table-column label="价值" width="120" align="right">
              <template #default="{ row }">{{ fmtNumber(row.value) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">物品 Top</div>
          <el-table :data="summary.byType" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="type" label="物品" />
            <el-table-column prop="quantity" label="数量" width="90" align="right" />
            <el-table-column label="价值" width="120" align="right">
              <template #default="{ row }">{{ fmtNumber(row.value) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <div class="panel" style="margin-top: 16px">
      <div class="panel-title">资产明细</div>
      <el-table :data="items" style="width: 100%" :class="'dark-table'" v-loading="loading">
        <el-table-column prop="typeName" label="物品" min-width="200" />
        <el-table-column prop="locationName" label="位置" min-width="180" />
        <el-table-column prop="quantity" label="数量" width="100" align="right" />
        <el-table-column label="蓝图" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isBlueprint" size="small" type="warning" effect="dark">BP</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="估算价值" width="130" align="right">
          <template #default="{ row }">{{ fmtNumber(row.estimatedValue) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next"
          background
          small
          @current-change="load"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { assetApi, orgApi, esiApi } from '../api';
import { fmtNumber, fmtIsk } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const summary = ref({ totalValue: 0, count: 0, typeCount: 0, byLocation: [], byType: [] });
const query = reactive({ orgId: undefined as number | undefined, search: '', page: 1, pageSize: 20 });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadAll();
});

async function loadAll() {
  await Promise.all([load(), loadSummary()]);
}

async function load() {
  loading.value = true;
  try {
    const res = await assetApi.list({ ownerId: query.orgId, search: query.search, page: query.page, pageSize: query.pageSize, ownerType: 'corporation' });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadSummary() {
  summary.value = await assetApi.summary({ ownerId: query.orgId, ownerType: 'corporation' });
}

async function syncAssets() {
  if (!query.orgId) {
    ElMessage.warning('请先选择军团');
    return;
  }
  const res = await esiApi.syncOrg(query.orgId);
  ElMessage.success(`同步完成，资产 ${res.counts?.assets ?? 0} 条`);
  loadAll();
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
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.summary-card {
  padding: 16px;
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
}
.summary-card .label {
  font-size: 12px;
  color: #7d89a8;
}
.summary-card .value {
  font-size: 18px;
  font-weight: 700;
  color: #eef2ff;
  margin-top: 6px;
}
.panel {
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
  padding: 16px;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #c6cfe8;
  margin-bottom: 12px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
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
</style>
