<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="报销申请" name="claims">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadClaims">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-select v-model="query.status" placeholder="状态" clearable size="small" style="width: 130px" @change="loadClaims">
              <el-option label="待审核" value="pending" />
              <el-option label="已通过" value="approved" />
              <el-option label="已拒绝" value="rejected" />
              <el-option label="已打款" value="paid" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button size="small" type="primary" plain @click="importVisible = true">导入 Killmail</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="claims" size="small" style="width: 100%" :class="'dark-table'" v-loading="loadingClaims">
            <el-table-column prop="characterName" label="申请人" min-width="110" />
            <el-table-column prop="shipName" label="损失船只" min-width="130" />
            <el-table-column label="损失估值" width="110" align="right">
              <template #default="{ row }">{{ fmtIsk(row.lossValue) }}</template>
            </el-table-column>
            <el-table-column label="比例" width="70" align="right">
              <template #default="{ row }">{{ Math.round(row.payoutRatio * 100) }}%</template>
            </el-table-column>
            <el-table-column label="报销额" width="110" align="right">
              <template #default="{ row }"><span class="hl">{{ fmtIsk(row.payout) }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" width="150">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending' && store.isOfficer">
                  <el-button size="small" type="success" @click="review(row, true)">通过</el-button>
                  <el-button size="small" type="danger" plain @click="review(row, false)">拒绝</el-button>
                </template>
                <template v-if="row.status === 'approved' && store.isOfficer">
                  <el-button size="small" type="primary" @click="paid(row)">打款</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="total, prev, pager, next" class="pager" @current-change="onPage" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="报销规则" name="rules">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="ruleOrgId" placeholder="选择军团" size="small" style="width: 200px">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="ruleVisible = true">新增规则</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="rules" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="适用船型" min-width="130">
              <template #default="{ row }">{{ row.shipType === 'all' ? '全部船只' : `TypeID ${row.shipType}` }}</template>
            </el-table-column>
            <el-table-column label="报销比例" width="100">
              <template #default="{ row }">{{ Math.round(row.ratio * 100) }}%</template>
            </el-table-column>
            <el-table-column label="单笔上限" width="120" align="right">
              <template #default="{ row }">{{ row.cap ? fmtIsk(row.cap) : '不限' }}</template>
            </el-table-column>
            <el-table-column label="条约限制" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.treatyOnly ? 'warning' : 'info'">{{ row.treatyOnly ? '需条约' : '无条件' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button v-if="store.isAdmin" size="small" type="danger" plain @click="removeRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!rules.length" class="empty">暂无规则</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="月度统计" name="monthly">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="monthOrgId" placeholder="选择军团" size="small" style="width: 200px" @change="loadMonthly">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
        </div>
        <div class="panel">
          <el-table :data="monthly" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="ym" label="月份" min-width="120" />
            <el-table-column label="支出 ISK" align="right">
              <template #default="{ row }">{{ fmtIsk(Number(row.spent)) }}</template>
            </el-table-column>
            <el-table-column label="打款笔数" align="right">
              <template #default="{ row }">{{ row.paidCount }}</template>
            </el-table-column>
          </el-table>
          <div v-if="!monthly.length" class="empty">暂无数据</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 导入 killmail -->
    <el-dialog v-model="importVisible" title="导入 Killmail" width="460px">
      <el-form :model="importForm" label-width="110px">
        <el-form-item label="军团">
          <el-select v-model="importForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Killmail ID" required><el-input v-model="importForm.killmailId" placeholder="zKillboard 击杀 ID" /></el-form-item>
        <el-form-item label="Hash"><el-input v-model="importForm.hash" placeholder="可选" /></el-form-item>
        <el-form-item label="申请人角色 ID"><el-input-number v-model="importForm.characterId" :min="0" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">导入核验</el-button>
      </template>
    </el-dialog>

    <!-- 新增规则 -->
    <el-dialog v-model="ruleVisible" title="新增报销规则" width="460px">
      <el-form :model="ruleForm" label-width="110px">
        <el-form-item label="军团">
          <el-select v-model="ruleForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="船型 TypeID"><el-input v-model="ruleForm.shipType" placeholder="输入 typeId 或 all" /></el-form-item>
        <el-form-item label="报销比例 %"><el-input-number v-model="ruleForm.ratioPercent" :min="0" :max="100" style="width: 100%" /></el-form-item>
        <el-form-item label="单笔上限 ISK"><el-input-number v-model="ruleForm.cap" :min="0" :step="1000000" style="width: 100%" /></el-form-item>
        <el-form-item label="仅条约行动"><el-switch v-model="ruleForm.treatyOnly" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleVisible = false">取消</el-button>
        <el-button type="primary" @click="doRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { srpApi, orgApi } from '../api';
import { fmtIsk } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('claims');
const claims = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loadingClaims = ref(false);
const orgOptions = ref<any[]>([]);
const importVisible = ref(false);
const importing = ref(false);
const ruleVisible = ref(false);
const rules = ref<any[]>([]);
const monthly = ref<any[]>([]);
const ruleOrgId = ref<number | undefined>(undefined);
const monthOrgId = ref<number | undefined>(undefined);

const query = reactive({ orgId: undefined as number | undefined, status: undefined as string | undefined });
const importForm = reactive({ orgId: undefined as number | undefined, killmailId: '', hash: '', characterId: 0 });
const ruleForm = reactive({ orgId: undefined as number | undefined, shipType: 'all', ratioPercent: 100, cap: 0, treatyOnly: false });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadClaims();
});

async function loadClaims() {
  loadingClaims.value = true;
  try {
    const res = await srpApi.claims({ ...query, page: page.value, pageSize });
    claims.value = res.items;
    total.value = res.total;
  } finally {
    loadingClaims.value = false;
  }
}

async function loadRules() {
  rules.value = ruleOrgId.value ? await srpApi.rules(ruleOrgId.value) : [];
}

async function loadMonthly() {
  monthly.value = monthOrgId.value ? await srpApi.monthly(monthOrgId.value) : [];
}

function onPage(p: number) {
  page.value = p;
  loadClaims();
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝', paid: '已打款' }[s] || s;
}
function statusType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger', paid: 'primary' }[s] || 'info';
}

async function doImport() {
  if (!importForm.orgId || !importForm.killmailId) return ElMessage.warning('请填写军团与 Killmail ID');
  importing.value = true;
  try {
    const c = await srpApi.import({ orgId: importForm.orgId, orgType: 'corporation', killmailId: Number(importForm.killmailId), hash: importForm.hash || undefined, characterId: importForm.characterId || undefined });
    ElMessage.success(`已导入：${c.shipName || '未知船只'}，估值 ${fmtIsk(c.lossValue)}，可报 ${fmtIsk(c.payout)}`);
    importVisible.value = false;
    loadClaims();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '导入失败，请确认 Killmail ID 有效');
  } finally {
    importing.value = false;
  }
}

async function review(row: any, approve: boolean) {
  const reason = approve ? '' : (await promptNote('拒绝原因')) || '';
  await srpApi.review(row.id, approve, reason);
  ElMessage.success(approve ? '已通过' : '已拒绝');
  loadClaims();
}

async function paid(row: any) {
  const { value } = await ElMessageBox.prompt('打款凭证（可留空）', '确认打款');
  await srpApi.paid(row.id, value || '');
  ElMessage.success('已打款');
  loadClaims();
}

async function doRule() {
  if (!ruleForm.orgId || !ruleForm.shipType) return ElMessage.warning('请填写必填项');
  await srpApi.upsertRule({ orgId: ruleForm.orgId, orgType: 'corporation', shipType: ruleForm.shipType, ratio: ruleForm.ratioPercent / 100, cap: ruleForm.cap, treatyOnly: ruleForm.treatyOnly, enabled: true });
  ElMessage.success('规则已保存');
  ruleVisible.value = false;
  loadRules();
}

async function removeRule(row: any) {
  await ElMessageBox.confirm('确认删除该规则？', '删除规则');
  await srpApi.removeRule(row.id);
  ElMessage.success('已删除');
  loadRules();
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
.hl { color: #46a758; font-weight: 600; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
