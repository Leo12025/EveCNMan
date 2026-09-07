<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="工作单" name="jobs">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadJobs">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-select v-model="query.status" placeholder="状态" clearable size="small" style="width: 130px" @change="loadJobs">
              <el-option label="计划中" value="planned" />
              <el-option label="进行中" value="in_progress" />
              <el-option label="已完成" value="done" />
              <el-option label="已交付" value="delivered" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="jobVisible = true">新建工作单</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="jobs" size="small" style="width: 100%" :class="'dark-table'" v-loading="loadingJobs">
            <el-table-column prop="productName" label="产品" min-width="150" />
            <el-table-column prop="blueprintName" label="蓝图" min-width="150" />
            <el-table-column label="次数" width="70" align="right">
              <template #default="{ row }">{{ row.runs }}</template>
            </el-table-column>
            <el-table-column label="成本" width="110" align="right">
              <template #default="{ row }">{{ fmtIsk(row.cost) }}</template>
            </el-table-column>
            <el-table-column prop="facility" label="设施" min-width="110" />
            <el-table-column prop="creatorName" label="发起人" width="100" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="jobStatusType(row.status)">{{ jobStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <template v-if="store.isOfficer">
                  <el-button v-if="row.status === 'planned'" size="small" type="primary" @click="updateJob(row, 'in_progress')">开工</el-button>
                  <el-button v-if="row.status === 'in_progress'" size="small" type="success" @click="updateJob(row, 'done')">完工</el-button>
                  <el-button v-if="row.status === 'done'" size="small" type="info" @click="updateJob(row, 'delivered')">交付</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!jobs.length" class="empty">暂无工作单</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="矿队产量" name="mining">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="miningOrgId" placeholder="选择军团" size="small" style="width: 200px">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-date-picker v-model="miningPeriod" type="month" placeholder="周期" size="small" style="width: 140px" @change="loadMining" />
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="ledgerVisible = true">录入产量</el-button>
          </div>
        </div>
        <el-row v-if="miningReport" :gutter="16">
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">按角色</div>
              <el-table :data="miningReport.byCharacter" size="small" style="width: 100%" :class="'dark-table'">
                <el-table-column prop="characterName" label="角色" min-width="130" />
                <el-table-column label="总产量" align="right">
                  <template #default="{ row }">{{ Number(row.quantity).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column label="总价值" align="right">
                  <template #default="{ row }">{{ fmtIsk(Number(row.value)) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">按矿石</div>
              <el-table :data="miningReport.byOre" size="small" style="width: 100%" :class="'dark-table'">
                <el-table-column prop="typeName" label="矿石" min-width="130" />
                <el-table-column label="产量" align="right">
                  <template #default="{ row }">{{ Number(row.quantity).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column label="价值" align="right">
                  <template #default="{ row }">{{ fmtIsk(Number(row.value)) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
        </el-row>
        <div v-if="miningReport" class="panel" style="margin-top: 16px">
          <div class="panel-title">总价值：{{ fmtIsk(miningReport.totalValue) }}</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建工作单 -->
    <el-dialog v-model="jobVisible" title="新建工作单" width="480px">
      <el-form :model="jobForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="jobForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品名" required><el-input v-model="jobForm.productName" /></el-form-item>
        <el-form-item label="蓝图名"><el-input v-model="jobForm.blueprintName" /></el-form-item>
        <el-form-item label="蓝图 TypeID"><el-input-number v-model="jobForm.blueprintTypeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="次数"><el-input-number v-model="jobForm.runs" :min="1" style="width: 100%" /></el-form-item>
        <el-form-item label="设施"><el-input v-model="jobForm.facility" /></el-form-item>
        <el-form-item label="发起人"><el-input v-model="jobForm.creatorName" /></el-form-item>
        <el-form-item label="预估成本"><el-input-number v-model="jobForm.cost" :min="0" :step="100000" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="jobVisible = false">取消</el-button>
        <el-button type="primary" @click="doCreateJob">保存</el-button>
      </template>
    </el-dialog>

    <!-- 录入产量 -->
    <el-dialog v-model="ledgerVisible" title="录入矿队产量" width="480px">
      <el-form :model="ledgerForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="ledgerForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色名" required><el-input v-model="ledgerForm.characterName" /></el-form-item>
        <el-form-item label="矿石名" required><el-input v-model="ledgerForm.typeName" /></el-form-item>
        <el-form-item label="矿石 TypeID"><el-input-number v-model="ledgerForm.typeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="数量" required><el-input-number v-model="ledgerForm.quantity" :min="1" style="width: 100%" /></el-form-item>
        <el-form-item label="估算价值"><el-input-number v-model="ledgerForm.value" :min="0" :step="100000" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ledgerVisible = false">取消</el-button>
        <el-button type="primary" @click="doLedger">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { industryApi, orgApi } from '../api';
import { fmtIsk } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('jobs');
const jobs = ref<any[]>([]);
const loadingJobs = ref(false);
const orgOptions = ref<any[]>([]);
const jobVisible = ref(false);
const ledgerVisible = ref(false);
const miningOrgId = ref<number | undefined>(undefined);
const miningPeriod = ref(new Date());
const miningReport = ref<any>(null);

const query = reactive({ orgId: undefined as number | undefined, status: undefined as string | undefined });
const jobForm = reactive({ orgId: undefined as number | undefined, productName: '', blueprintName: '', blueprintTypeId: 0, runs: 1, facility: '', creatorName: '', cost: 0 });
const ledgerForm = reactive({ orgId: undefined as number | undefined, characterName: '', typeName: '', typeId: 0, quantity: 1, value: 0 });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadJobs();
});

async function loadJobs() {
  loadingJobs.value = true;
  try {
    jobs.value = await industryApi.listJobs(query);
  } finally {
    loadingJobs.value = false;
  }
}

async function loadMining() {
  if (!miningOrgId.value) {
    miningReport.value = null;
    return;
  }
  const d = new Date(miningPeriod.value);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  miningReport.value = await industryApi.miningReport(miningOrgId.value, period);
}

async function doCreateJob() {
  if (!jobForm.orgId || !jobForm.productName) return ElMessage.warning('请填写必填项');
  await industryApi.createJob({ ...jobForm, orgType: 'corporation', productTypeId: 0, status: 'planned', materials: '[]' });
  ElMessage.success('工作单已创建');
  jobVisible.value = false;
  loadJobs();
}

async function updateJob(row: any, status: string) {
  await industryApi.updateJob(row.id, { status });
  ElMessage.success('状态已更新');
  loadJobs();
}

async function doLedger() {
  if (!ledgerForm.orgId || !ledgerForm.characterName || !ledgerForm.typeName) return ElMessage.warning('请填写必填项');
  const d = new Date(miningPeriod.value);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  await industryApi.upsertLedger({ ...ledgerForm, orgType: 'corporation', period });
  ElMessage.success('已录入');
  ledgerVisible.value = false;
  loadMining();
}

function jobStatusLabel(s: string) {
  return { planned: '计划中', in_progress: '进行中', done: '已完成', delivered: '已交付', cancelled: '已取消' }[s] || s;
}
function jobStatusType(s: string) {
  return { planned: 'info', in_progress: 'warning', done: 'success', delivered: 'primary', cancelled: 'danger' }[s] || 'info';
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.panel-title { font-size: 14px; font-weight: 600; color: #c6cfe8; margin-bottom: 12px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
</style>
