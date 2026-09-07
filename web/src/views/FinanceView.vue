<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="支出审批" name="expenses">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-select v-model="query.status" placeholder="状态" clearable size="small" style="width: 130px" @change="load">
              <el-option label="待审核" value="pending" />
              <el-option label="已通过" value="approved" />
              <el-option label="已拒绝" value="rejected" />
              <el-option label="已打款" value="paid" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button size="small" type="primary" plain @click="applyVisible = true">发起申请</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
            <el-table-column prop="title" label="标题" min-width="150" />
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">{{ fmtIsk(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="category" label="分类" width="100">
              <template #default="{ row }">{{ row.category || '-' }}</template>
            </el-table-column>
            <el-table-column prop="payee" label="收款方" min-width="110">
              <template #default="{ row }">{{ row.payee || '-' }}</template>
            </el-table-column>
            <el-table-column label="申请人" width="100">
              <template #default="{ row }">{{ row.applicant?.username?.replace(/^eve:/, '') || '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请时间" width="150">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending' && store.isOfficer">
                  <el-button size="small" type="success" @click="review(row, true)">通过</el-button>
                  <el-button size="small" type="danger" plain @click="review(row, false)">拒绝</el-button>
                </template>
                <template v-if="row.status === 'approved' && store.isOfficer">
                  <el-button size="small" type="primary" @click="payout(row)">打款</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="total, prev, pager, next" class="pager" @current-change="onPage" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分红计算" name="payouts">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="payoutOrgId" placeholder="选择军团" size="small" style="width: 200px">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-date-picker v-model="payoutPeriod" type="month" placeholder="周期" size="small" style="width: 140px" />
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="openCompute">计算分红</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="payouts" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="周期" width="100">
              <template #default="{ row }">{{ row.period }}</template>
            </el-table-column>
            <el-table-column label="奖金池" align="right" width="130">
              <template #default="{ row }">{{ fmtIsk(row.pool) }}</template>
            </el-table-column>
            <el-table-column label="计算方式" width="110">
              <template #default="{ row }">{{ basisLabel(row.basis) }}</template>
            </el-table-column>
            <el-table-column label="人数" width="70">
              <template #default="{ row }">{{ JSON.parse(row.detail).length }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="payoutStatusType(row.status)">{{ payoutStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="明细" min-width="200">
              <template #default="{ row }">
                <div class="payout-detail" v-if="JSON.parse(row.detail).length">
                  <span v-for="d in JSON.parse(row.detail).slice(0, 3)" :key="d.characterId" class="payout-item">{{ d.characterName }} {{ fmtIsk(d.amount) }}</span>
                  <span v-if="JSON.parse(row.detail).length > 3" class="muted">等 {{ JSON.parse(row.detail).length }} 人</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'draft' && store.isAdmin">
                  <el-button size="small" type="success" @click="finalize(row, 'approved')">批准</el-button>
                </template>
                <template v-if="row.status === 'approved' && store.isAdmin">
                  <el-button size="small" type="primary" @click="finalize(row, 'paid')">发放</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!payouts.length" class="empty">暂无分红记录</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 发起申请 -->
    <el-dialog v-model="applyVisible" title="发起支出申请" width="480px">
      <el-form :model="applyForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="applyForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required><el-input v-model="applyForm.title" /></el-form-item>
        <el-form-item label="金额 ISK" required><el-input-number v-model="applyForm.amount" :min="0" :step="100000" style="width: 100%" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="applyForm.category" placeholder="如：SRP / 工业 / 物资" /></el-form-item>
        <el-form-item label="收款方"><el-input v-model="applyForm.payee" placeholder="角色名或描述" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="applyForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="applyVisible = false">取消</el-button>
        <el-button type="primary" @click="doApply">提交</el-button>
      </template>
    </el-dialog>

    <!-- 分红参数 -->
    <el-dialog v-model="computeVisible" title="计算分红" width="420px">
      <el-form label-width="90px">
        <el-form-item label="奖金池 ISK"><el-input-number v-model="pool" :min="0" :step="1000000" style="width: 100%" /></el-form-item>
        <el-form-item label="计算方式">
          <el-select v-model="basis" style="width: 100%">
            <el-option label="按军税比例" value="tax-ratio" />
            <el-option label="按 SP 比例" value="sp" />
            <el-option label="平均分配" value="equal" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="computeVisible = false">取消</el-button>
        <el-button type="primary" @click="doCompute">计算</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { financeApi, orgApi } from '../api';
import { fmtIsk } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('expenses');
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const applyVisible = ref(false);
const computeVisible = ref(false);
const payouts = ref<any[]>([]);
const payoutOrgId = ref<number | undefined>(undefined);
const payoutPeriod = ref(new Date());
const pool = ref(0);
const basis = ref('tax-ratio');

const query = reactive({ orgId: undefined as number | undefined, status: undefined as string | undefined });
const applyForm = reactive({ orgId: undefined as number | undefined, title: '', amount: 0, category: '', payee: '', description: '' });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
  loadPayouts();
});

async function load() {
  loading.value = true;
  try {
    const res = await financeApi.listExpenses({ ...query, page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadPayouts() {
  if (!payoutOrgId.value) {
    payouts.value = [];
    return;
  }
  payouts.value = await financeApi.listPayouts(payoutOrgId.value);
}

function onPage(p: number) {
  page.value = p;
  load();
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝', paid: '已打款' }[s] || s;
}
function statusType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger', paid: 'primary' }[s] || 'info';
}
function payoutStatusLabel(s: string) {
  return { draft: '草稿', approved: '已批准', paid: '已发放' }[s] || s;
}
function payoutStatusType(s: string) {
  return { draft: 'info', approved: 'success', paid: 'primary' }[s] || 'info';
}
function basisLabel(s: string) {
  return { 'tax-ratio': '军税比例', sp: 'SP 比例', equal: '平均' }[s] || s;
}

async function doApply() {
  if (!applyForm.orgId || !applyForm.title || !applyForm.amount) return ElMessage.warning('请填写必填项');
  await financeApi.apply({ ...applyForm, orgType: 'corporation', currency: 'ISK' });
  ElMessage.success('已提交申请');
  applyVisible.value = false;
  load();
}

async function review(row: any, approve: boolean) {
  const note = approve ? '' : (await promptNote('拒绝原因')) || '';
  await financeApi.reviewExpense(row.id, approve, note);
  ElMessage.success(approve ? '已通过' : '已拒绝');
  load();
}

async function payout(row: any) {
  const { value } = await ElMessageBox.prompt('打款凭证 / 交易 ID（可留空）', '确认打款');
  await financeApi.payoutExpense(row.id, value || '');
  ElMessage.success('已打款');
  load();
}

function openCompute() {
  if (!payoutOrgId.value) return ElMessage.warning('请先选择军团');
  computeVisible.value = true;
}

async function doCompute() {
  const d = new Date(payoutPeriod.value);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  await financeApi.computePayout({ orgId: payoutOrgId.value, orgType: 'corporation', period, pool: pool.value, basis: basis.value });
  ElMessage.success('分红已计算');
  computeVisible.value = false;
  loadPayouts();
}

async function finalize(row: any, status: string) {
  if (status === 'paid') {
    await ElMessageBox.confirm(`确认「${row.period || ''}」期分红已实际发放？此操作不可撤销。`, '发放确认', { type: 'warning' });
  } else {
    await ElMessageBox.confirm('确认批准该期分红计算？批准后仅可发放。', '批准确认', { type: 'warning' });
  }
  await financeApi.finalizePayout(row.id, status);
  ElMessage.success(status === 'approved' ? '已批准' : '已标记发放');
  loadPayouts();
}

function promptNote(msg: string) {
  return ElMessageBox.prompt(msg, '备注', { inputPlaceholder: '可选' }).then((r: any) => r.value).catch(() => '');
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.payout-detail { display: flex; flex-direction: column; gap: 2px; }
.payout-item { font-size: 12px; color: #c6cfe8; }
.muted { color: #5b6780; font-size: 12px; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
