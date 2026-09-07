<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="外交关系" name="relations">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="orgId" placeholder="选择组织" size="small" style="width: 220px" @change="loadRelations">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="relationVisible = true">新增关系</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="relations" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="targetName" label="对方组织" min-width="140" />
            <el-table-column label="关系" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="relationType(row.relation)">{{ relationLabel(row.relation) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="声望" width="110" align="right">
              <template #default="{ row }">
                <span :class="row.standing >= 0 ? 'pos' : 'neg'">{{ row.standing.toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button v-if="store.isAdmin" size="small" type="danger" plain @click="removeRelation(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!relations.length" class="empty">暂无外交关系</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="转会流程" name="transfers">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="transferStatus" placeholder="状态" clearable size="small" style="width: 130px" @change="loadTransfers">
              <el-option label="待审核" value="requested" />
              <el-option label="已通过" value="approved" />
              <el-option label="已拒绝" value="rejected" />
              <el-option label="已完成" value="done" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button size="small" type="primary" plain @click="transferVisible = true">发起转会</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="transfers" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="characterName" label="角色" min-width="130" />
            <el-table-column label="来源组织" width="110">
              <template #default="{ row }">{{ orgName(row.fromOrgId) }}</template>
            </el-table-column>
            <el-table-column label="目标组织" min-width="130">
              <template #default="{ row }">{{ row.toOrgName || row.toOrgId }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="transferStatusType(row.status)">{{ transferStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="note" label="备注" min-width="140" show-overflow-tooltip />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'requested' && store.isOfficer">
                  <el-button size="small" type="success" @click="reviewTransfer(row, true)">同意</el-button>
                  <el-button size="small" type="danger" plain @click="reviewTransfer(row, false)">拒绝</el-button>
                </template>
                <el-button v-if="row.status === 'approved' && store.isAdmin" size="small" type="primary" @click="completeTransfer(row)">完成</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!transfers.length" class="empty">暂无转会申请</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增关系 -->
    <el-dialog v-model="relationVisible" title="新增外交关系" width="460px">
      <el-form :model="relationForm" label-width="90px">
        <el-form-item label="组织">
          <el-select v-model="relationForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="对方 ID" required><el-input-number v-model="relationForm.targetId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="对方名称"><el-input v-model="relationForm.targetName" /></el-form-item>
        <el-form-item label="关系">
          <el-radio-group v-model="relationForm.relation">
            <el-radio-button label="blue">蓝</el-radio-button>
            <el-radio-button label="neutral">白</el-radio-button>
            <el-radio-button label="red">红</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="声望"><el-input-number v-model="relationForm.standing" :min="-10" :max="10" :step="0.5" style="width: 100%" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="relationForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="relationVisible = false">取消</el-button>
        <el-button type="primary" @click="doRelation">保存</el-button>
      </template>
    </el-dialog>

    <!-- 发起转会 -->
    <el-dialog v-model="transferVisible" title="发起联盟间转会" width="460px">
      <el-form :model="transferForm" label-width="90px">
        <el-form-item label="角色名" required><el-input v-model="transferForm.characterName" /></el-form-item>
        <el-form-item label="来源组织 ID" required><el-input-number v-model="transferForm.fromOrgId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="目标组织 ID" required><el-input-number v-model="transferForm.toOrgId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="目标名称"><el-input v-model="transferForm.toOrgName" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="transferForm.note" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" @click="doTransfer">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { diplomacyApi, orgApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('relations');
const orgId = ref<number | undefined>(undefined);
const orgOptions = ref<any[]>([]);
const relations = ref<any[]>([]);
const relationVisible = ref(false);
const transfers = ref<any[]>([]);
const transferStatus = ref<string | undefined>(undefined);
const transferVisible = ref(false);

const relationForm = reactive({ orgId: undefined as number | undefined, targetId: 0, targetName: '', relation: 'blue', standing: 5, note: '' });
const transferForm = reactive({ characterName: '', fromOrgId: 0, toOrgId: 0, toOrgName: '', note: '' });

onMounted(async () => {
  orgOptions.value = await orgApi.list({ managedOnly: true });
  loadTransfers();
});

async function loadRelations() {
  relations.value = orgId.value ? await diplomacyApi.list(orgId.value) : [];
}

async function loadTransfers() {
  transfers.value = await diplomacyApi.transfers(transferStatus.value);
}

async function doRelation() {
  if (!relationForm.orgId || !relationForm.targetId) return ElMessage.warning('请填写必填项');
  await diplomacyApi.upsert({ ...relationForm, orgType: 'corporation' });
  ElMessage.success('关系已保存');
  relationVisible.value = false;
  loadRelations();
}

async function removeRelation(row: any) {
  await ElMessageBox.confirm('确认删除该关系？', '删除关系');
  await diplomacyApi.remove(row.id);
  ElMessage.success('已删除');
  loadRelations();
}

async function doTransfer() {
  if (!transferForm.characterName || !transferForm.fromOrgId || !transferForm.toOrgId) return ElMessage.warning('请填写必填项');
  await diplomacyApi.createTransfer(transferForm);
  ElMessage.success('转会申请已提交');
  transferVisible.value = false;
  loadTransfers();
}

async function reviewTransfer(row: any, approve: boolean) {
  await diplomacyApi.reviewTransfer(row.id, approve);
  ElMessage.success(approve ? '已同意' : '已拒绝');
  loadTransfers();
}

async function completeTransfer(row: any) {
  await diplomacyApi.completeTransfer(row.id);
  ElMessage.success('转会已完成');
  loadTransfers();
}

function orgName(id: number) {
  return orgOptions.value.find((o) => o.id === id)?.name || String(id);
}
function relationLabel(r: string) {
  return { blue: '蓝名单', neutral: '白名单', red: '红名单' }[r] || r;
}
function relationType(r: string) {
  return { blue: 'primary', neutral: 'info', red: 'danger' }[r] || 'info';
}
function transferStatusLabel(s: string) {
  return { requested: '待审核', approved: '已通过', rejected: '已拒绝', done: '已完成' }[s] || s;
}
function transferStatusType(s: string) {
  return { requested: 'warning', approved: 'success', rejected: 'danger', done: 'primary' }[s] || 'info';
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.pos { color: #46a758; font-weight: 600; }
.neg { color: #e5484d; font-weight: 600; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
</style>
