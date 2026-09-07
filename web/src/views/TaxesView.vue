<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadAll">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-select v-model="query.year" placeholder="年份" clearable size="small" style="width: 110px" @change="load">
          <el-option v-for="y in years" :key="y" :label="String(y)" :value="y" />
        </el-select>
        <el-select v-model="query.month" placeholder="月份" clearable size="small" style="width: 110px" @change="load">
          <el-option v-for="m in 12" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button v-if="store.isAdmin" size="small" type="primary" plain @click="importVisible = true">手动录入</el-button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">全部税单</div>
        <div class="value">{{ total }} 条</div>
      </div>
      <div class="summary-card">
        <div class="label">累计税收</div>
        <div class="value">{{ fmtIsk(totalAmount) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">军团钱包总余额</div>
        <div class="value">{{ fmtIsk(settle?.total) }}</div>
      </div>
    </div>

    <div v-if="settle" class="panel" style="margin-bottom: 16px">
      <div class="panel-title">钱包结算 · {{ settle.orgName }}</div>
      <div class="wallet-grid">
        <div v-for="b in settle.balances" :key="b.division" class="wallet-item">
          <div class="wallet-label">分部 {{ b.division }}</div>
          <div class="wallet-value">{{ fmtNumber(b.balance) }}</div>
        </div>
        <div class="wallet-item highlight">
          <div class="wallet-label">总计</div>
          <div class="wallet-value">{{ fmtNumber(settle.total) }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="10">
        <div class="panel">
          <div class="panel-title">月度汇总</div>
          <el-table :data="monthly" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="orgName" label="军团" min-width="130" />
            <el-table-column label="月份" width="80">
              <template #default="{ row }">{{ row.year }}/{{ row.month }}</template>
            </el-table-column>
            <el-table-column label="金额" align="right">
              <template #default="{ row }">{{ fmtNumber(row.total) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="14">
        <div class="panel">
          <div class="panel-title">税单明细</div>
          <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
            <el-table-column prop="characterName" label="成员" min-width="130" />
            <el-table-column prop="orgName" label="军团" min-width="130" />
            <el-table-column label="年月" width="90">
              <template #default="{ row }">{{ row.year }}/{{ row.month }}</template>
            </el-table-column>
            <el-table-column label="缴纳" align="right" width="110">
              <template #default="{ row }">{{ fmtNumber(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <!-- 手动录入 -->
    <el-dialog v-model="importVisible" title="手动录入税单" width="460px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="军团">
          <el-select v-model="form.orgId" placeholder="选择军团" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="成员名">
          <el-input v-model="form.characterName" />
        </el-form-item>
        <el-form-item label="金额 ISK">
          <el-input-number v-model="form.amount" :min="0" :step="100000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" @click="doImport">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { taxApi, orgApi, walletApi } from '../api';
import { fmtNumber, fmtIsk } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const monthly = ref<any[]>([]);
const settle = ref<any>(null);
const importVisible = ref(false);
const now = new Date();
const years = [now.getFullYear(), now.getFullYear() - 1];

const query = reactive({ orgId: undefined as number | undefined, year: now.getFullYear() as number | undefined, month: (now.getMonth() + 1) as number | undefined });
const form = reactive({ orgId: undefined as number | undefined, characterName: '', amount: 1000000, note: '' });

const totalAmount = computed(() => items.value.reduce((s, i) => s + i.amount, 0));

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadAll();
});

async function loadAll() {
  await Promise.all([load(), loadMonthly(), loadSettle()]);
}

async function loadSettle() {
  if (!query.orgId) {
    settle.value = null;
    return;
  }
  try {
    settle.value = await walletApi.settle(query.orgId);
  } catch {
    settle.value = null;
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await taxApi.list(query);
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadMonthly() {
  monthly.value = await taxApi.monthlySummary({ orgId: query.orgId });
}

async function doImport() {
  const org = orgOptions.value.find((o) => o.id === form.orgId);
  await taxApi.import({
    orgId: form.orgId,
    orgName: org?.name || '',
    characterId: 0,
    characterName: form.characterName,
    year: query.year || now.getFullYear(),
    month: query.month || now.getMonth() + 1,
    amount: form.amount,
    note: form.note,
  });
  ElMessage.success('已录入');
  importVisible.value = false;
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
  flex-wrap: wrap;
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
.wallet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.wallet-item {
  padding: 12px;
  background: #0f1630;
  border-radius: 8px;
  text-align: center;
}
.wallet-item.highlight {
  background: rgba(79, 124, 255, 0.12);
  border: 1px solid rgba(79, 124, 255, 0.3);
}
.wallet-label {
  font-size: 12px;
  color: #5b6780;
}
.wallet-value {
  font-size: 15px;
  font-weight: 600;
  color: #eef2ff;
  margin-top: 4px;
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
