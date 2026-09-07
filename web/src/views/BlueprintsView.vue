<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.ownerId" placeholder="全部组织/角色" clearable size="small" style="width: 220px" @change="load">
          <el-option v-for="o in ownerOptions" :key="o.id" :label="o.label" :value="o.id" />
        </el-select>
        <el-input v-model="query.search" placeholder="搜索蓝图名称" clearable size="small" style="width: 220px" @input="load" />
      </div>
      <div class="toolbar-right">
        <el-tag size="small" type="info">共 {{ total }} 份蓝图</el-tag>
      </div>
    </div>

    <el-table :data="items" style="width: 100%" :class="'dark-table'" v-loading="loading" height="calc(100vh - 240px)">
      <el-table-column prop="typeName" label="蓝图名称" min-width="240" show-overflow-tooltip />
      <el-table-column label="数量" width="100" align="right">
        <template #default="{ row }">{{ fmtNumber(row.quantity) }}</template>
      </el-table-column>
      <el-table-column prop="location" label="所在位置" min-width="200" show-overflow-tooltip />
      <el-table-column label="估算价值" width="160" align="right">
        <template #default="{ row }">{{ row.estimatedValue ? fmtIsk(row.estimatedValue) : '-' }}</template>
      </el-table-column>
      <el-table-column label="归属" width="160">
        <template #default="{ row }">{{ ownerName(row.ownerType, row.ownerId) }}</template>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { assetApi, orgApi } from '../api';
import { fmtIsk, fmtNumber } from '../utils/format';

const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const ownerOptions = ref<{ id: number; label: string }[]>([]);
const ownerMap = ref<Record<string, string>>({});
const query = reactive({ ownerId: undefined as number | undefined, search: '', page: 1, pageSize: 100 });

function ownerName(type: string, id: number) {
  return ownerMap.value[`${type}:${id}`] || `${type} ${id}`;
}

onMounted(async () => {
  const orgs = await orgApi.list({ managedOnly: true });
  ownerOptions.value = orgs.map((o: any) => ({ id: o.id, label: `${o.name}（${o.type === 'corporation' ? '军团' : '联盟'}）` }));
  orgs.forEach((o: any) => (ownerMap.value[`corporation:${o.id}`] = o.name));
  load();
});

async function load() {
  loading.value = true;
  try {
    const res = await assetApi.blueprints({ ownerId: query.ownerId, search: query.search || undefined });
    items.value = res;
    total.value = res.length;
  } finally {
    loading.value = false;
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
