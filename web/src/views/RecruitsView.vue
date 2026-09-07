<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable size="small" style="width: 130px" @change="load">
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="已入团" value="joined" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button size="small" @click="gateVisible = true">门槛配置</el-button>
        <el-button v-if="store.isAdmin" size="small" type="primary" plain @click="submitVisible = true">新增申请</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
        <el-table-column prop="characterName" label="申请人" min-width="120" />
        <el-table-column prop="contact" label="联系方式" min-width="110" />
        <el-table-column label="来源" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.source === 'form' ? 'info' : 'primary'">{{ row.source === 'form' ? '表单' : '手动' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="申请理由" min-width="180" show-overflow-tooltip />
        <el-table-column label="门槛校验" width="200">
          <template #default="{ row }">
            <template v-if="row.gateResult">
              <el-tag size="small" :type="JSON.parse(row.gateResult).passed ? 'success' : 'danger'">
                {{ JSON.parse(row.gateResult).passed ? '达标' : '未达标' }}
              </el-tag>
              <div class="gate-detail" v-if="!JSON.parse(row.gateResult).passed">
                SP {{ JSON.parse(row.gateResult).sp.toLocaleString() }}/{{ JSON.parse(row.gateResult).minSp.toLocaleString() }}
              </div>
            </template>
            <span v-else class="muted">未校验</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending' && (store.isAdmin || store.isOfficer)">
              <el-button size="small" type="success" @click="doReview(row, true)">通过</el-button>
              <el-button size="small" type="danger" plain @click="doReview(row, false)">拒绝</el-button>
            </template>
            <template v-if="row.status === 'approved' && store.isAdmin">
              <el-button size="small" type="primary" @click="doJoin(row)">加团</el-button>
            </template>
            <el-button v-if="row.status === 'joined' && store.isAdmin" size="small" type="danger" plain @click="doLeave(row)">移出</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="total, prev, pager, next" class="pager" @current-change="onPage" />
    </div>

    <!-- 新增申请 -->
    <el-dialog v-model="submitVisible" title="新增入团申请" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色名" required><el-input v-model="form.characterName" /></el-form-item>
        <el-form-item label="角色 ID"><el-input-number v-model="form.characterId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="目标军团">
          <el-select v-model="form.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系方式"><el-input v-model="form.contact" placeholder="QQ / 微信 / Discord" /></el-form-item>
        <el-form-item label="申请理由"><el-input v-model="form.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="submitVisible = false">取消</el-button>
        <el-button type="primary" @click="doSubmit">提交</el-button>
      </template>
    </el-dialog>

    <!-- 门槛配置 -->
    <el-dialog v-model="gateVisible" title="入团门槛配置" width="480px">
      <el-form :model="gate" label-width="110px">
        <el-form-item label="目标军团">
          <el-select v-model="gate.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="最低 SP"><el-input-number v-model="gate.minSp" :min="0" :step="1000000" style="width: 100%" /></el-form-item>
        <el-form-item label="最低安全"><el-input-number v-model="gate.minSecurity" :min="-10" :max="10" :step="0.5" style="width: 100%" /></el-form-item>
        <el-form-item label="必备技能 ID"><el-input v-model="gate.requiredSkills" placeholder="逗号分隔 typeId，如 3300,3301" /></el-form-item>
        <el-form-item label="未达标自动拒绝"><el-switch v-model="gate.autoReject" /></el-form-item>
        <el-form-item label="启用校验"><el-switch v-model="gate.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gateVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { recruitApi, orgApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const submitVisible = ref(false);
const gateVisible = ref(false);
const query = reactive({ orgId: undefined as number | undefined, status: undefined as string | undefined });
const form = reactive({ characterName: '', characterId: 0, orgId: undefined as number | undefined, contact: '', reason: '' });
const gate = reactive({ orgId: undefined as number | undefined, minSp: 0, minSecurity: -10, requiredSkills: '', autoReject: false, enabled: true });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
});

async function load() {
  loading.value = true;
  try {
    const res = await recruitApi.list({ ...query, page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onPage(p: number) {
  page.value = p;
  load();
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝', joined: '已入团' }[s] || s;
}
function statusType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger', joined: 'primary' }[s] || 'info';
}

async function doSubmit() {
  if (!form.characterName || !form.orgId) return ElMessage.warning('请填写角色名并选择军团');
  await recruitApi.submit({ ...form, orgType: 'corporation', source: 'manual' });
  ElMessage.success('已提交');
  submitVisible.value = false;
  load();
}

async function doReview(row: any, approve: boolean) {
  const note = approve ? '' : (await promptNote('拒绝原因')) || '';
  await recruitApi.review(row.id, approve, note);
  ElMessage.success(approve ? '已通过' : '已拒绝');
  load();
}

async function doJoin(row: any) {
  const { value } = await ElMessageBox.prompt('请输入该角色的 EVE 角色 ID', '确认加团', { inputPattern: /^\d+$/, inputErrorMessage: '角色 ID 必须为数字' });
  await recruitApi.join(row.id, Number(value));
  ElMessage.success('已加团');
  load();
}

async function doLeave(row: any) {
  const reason = (await promptNote('离团原因')) || '';
  await recruitApi.leave(row.characterId, row.orgId, reason);
  ElMessage.success('已移出');
  load();
}

async function saveGate() {
  if (!gate.orgId) return ElMessage.warning('请选择军团');
  const skills = gate.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  await recruitApi.upsertGate({ orgId: gate.orgId, orgType: 'corporation', minSp: gate.minSp, minSecurity: gate.minSecurity, requiredSkills: JSON.stringify(skills), autoReject: gate.autoReject, enabled: gate.enabled });
  ElMessage.success('门槛已保存');
  gateVisible.value = false;
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
.gate-detail { font-size: 11px; color: #e5484d; margin-top: 2px; }
.muted { color: #5b6780; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
