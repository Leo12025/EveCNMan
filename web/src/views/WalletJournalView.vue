<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.ownerType" size="small" style="width: 140px" @change="load">
          <el-option label="全部账户" value="" />
          <el-option label="军团钱包" value="corporation" />
          <el-option label="角色钱包" value="character" />
        </el-select>
        <el-select v-model="query.orgId" placeholder="全部组织" clearable size="small" style="width: 200px" @change="load">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-select v-model="query.refType" placeholder="全部类型" clearable filterable size="small" style="width: 220px" @change="load">
          <el-option v-for="r in refTypes" :key="r" :label="r" :value="r" />
        </el-select>
        <el-input v-model="query.search" placeholder="描述/对手方" clearable size="small" style="width: 200px" @input="load" />
      </div>
      <div class="toolbar-right">
        <el-tag size="small" type="info">共 {{ total }} 条</el-tag>
      </div>
    </div>

    <el-table :data="items" style="width: 100%" :class="'dark-table'" v-loading="loading" height="calc(100vh - 240px)">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ fmtDateTime(row.date) }}</template>
      </el-table-column>
      <el-table-column prop="refType" label="类型" width="220" show-overflow-tooltip />
      <el-table-column prop="description" label="描述" min-width="260" show-overflow-tooltip />
      <el-table-column label="对手方" width="160">
        <template #default="{ row }">{{ row.counterpartyName || row.firstPartyName || '-' }}</template>
      </el-table-column>
      <el-table-column label="收入" width="140" align="right" sortable :sort-by="'amount'">
        <template #default="{ row }">
          <span v-if="row.amount > 0" style="color: #06d6a0">+{{ fmtIsk(row.amount) }}</span>
          <span v-else style="color: #ff6b6b">{{ fmtIsk(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="余额" width="140" align="right">
        <template #default="{ row }">{{ row.balance != null ? fmtIsk(row.balance) : '-' }}</template>
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
import { walletApi, orgApi } from '../api';
import { fmtIsk, fmtDateTime } from '../utils/format';

const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const refTypes = ref<string[]>([]);
const query = reactive({
  ownerType: '' as '' | 'corporation' | 'character',
  orgId: undefined as number | undefined,
  refType: undefined as string | undefined,
  search: '',
  page: 1,
  pageSize: 50,
});

onMounted(async () => {
  const [orgs, types] = await Promise.all([orgApi.list({ managedOnly: true }), walletApi.refTypes()]);
  orgOptions.value = orgs;
  refTypes.value = types;
  load();
});

async function load() {
  loading.value = true;
  try {
    const res = await walletApi.journals({
      ...query,
      ownerType: query.ownerType || undefined,
      orgId: query.orgId,
      refType: query.refType,
      search: query.search || undefined,
    });
    items.value = res.items;
    total.value = res.total;
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
