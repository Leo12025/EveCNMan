<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="舰队列表" name="fleets">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadFleets">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="fleetVisible = true">创建舰队</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="fleets" size="small" style="width: 100%" :class="'dark-table'" v-loading="loadingFleets">
            <el-table-column prop="title" label="集结主题" min-width="160" />
            <el-table-column prop="location" label="集合点" min-width="110" />
            <el-table-column label="集结时间" width="150">
              <template #default="{ row }">{{ new Date(row.scheduledAt).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="fleetStatusType(row.status)">{{ fleetStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Ping" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.pingSent ? 'success' : 'info'">{{ row.pingSent ? '已发' : '未发' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openDetail(row)">详情/登记</el-button>
                <el-button v-if="store.isOfficer && !row.pingSent" size="small" type="warning" plain @click="sendPing(row)">发 Ping</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!fleets.length" class="empty">暂无舰队</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="参与度统计" name="participation">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="partOrgId" placeholder="选择军团" size="small" style="width: 200px" @change="loadParticipation">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
        </div>
        <div class="panel">
          <el-table :data="participation" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="characterName" label="角色" min-width="140" />
            <el-table-column label="参舰队数" align="right" width="100">
              <template #default="{ row }">{{ row.fleets }}</template>
            </el-table-column>
            <el-table-column label="实际到场" align="right" width="100">
              <template #default="{ row }">{{ row.attended }}</template>
            </el-table-column>
            <el-table-column label="到场率" align="right" width="110">
              <template #default="{ row }">{{ row.fleets ? Math.round((row.attended / row.fleets) * 100) : 0 }}%</template>
            </el-table-column>
          </el-table>
          <div v-if="!participation.length" class="empty">暂无数据</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 创建舰队 -->
    <el-dialog v-model="fleetVisible" title="创建舰队/集结" width="480px">
      <el-form :model="fleetForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="fleetForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="集结主题" required><el-input v-model="fleetForm.title" /></el-form-item>
        <el-form-item label="集合点"><el-input v-model="fleetForm.location" placeholder="如：Jita 4-4 / 舰队频道" /></el-form-item>
        <el-form-item label="集结时间">
          <el-date-picker v-model="fleetForm.scheduledAt" type="datetime" placeholder="选择时间" style="width: 100%" />
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="fleetForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fleetVisible = false">取消</el-button>
        <el-button type="primary" @click="doCreateFleet">创建</el-button>
      </template>
    </el-dialog>

    <!-- 舰队详情 -->
    <el-dialog v-model="detailVisible" title="舰队详情与登记" width="720px">
      <template v-if="detail">
        <div class="detail-title">{{ detail.title }}</div>
        <div class="detail-meta">
          <span>集合点：{{ detail.location || '-' }}</span>
          <span>时间：{{ new Date(detail.scheduledAt).toLocaleString() }}</span>
        </div>
        <div class="signup-bar">
          <el-input v-model="signupName" placeholder="角色名" size="small" style="width: 160px" />
          <el-select v-model="signupRole" placeholder="编成" size="small" style="width: 120px">
            <el-option label="FC" value="FC" />
            <el-option label="Logi" value="Logi" />
            <el-option label="DPS" value="DPS" />
            <el-option label="Scout" value="Scout" />
            <el-option label="其它" value="Other" />
          </el-select>
          <el-button size="small" type="primary" plain @click="doSignup">登记</el-button>
        </div>
        <el-table :data="detail.members" size="small" style="width: 100%" :class="'dark-table'" class="signup-table">
          <el-table-column prop="characterName" label="角色" min-width="140" />
          <el-table-column prop="role" label="编成" width="90" />
          <el-table-column label="到场" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.attended ? 'success' : 'info'">{{ row.attended ? '到场' : '未到' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="store.isOfficer" size="small" @click="toggleAttendance(row)">切换</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="detail.aar" class="aar">AAR：{{ detail.aar }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fleetApi, orgApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('fleets');
const fleets = ref<any[]>([]);
const loadingFleets = ref(false);
const orgOptions = ref<any[]>([]);
const fleetVisible = ref(false);
const detailVisible = ref(false);
const detail = ref<any>(null);
const signupName = ref('');
const signupRole = ref('DPS');
const participation = ref<any[]>([]);
const partOrgId = ref<number | undefined>(undefined);

const query = reactive({ orgId: undefined as number | undefined });
const fleetForm = reactive({ orgId: undefined as number | undefined, title: '', location: '', scheduledAt: new Date(), description: '' });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadFleets();
});

async function loadFleets() {
  loadingFleets.value = true;
  try {
    fleets.value = await fleetApi.list(query);
  } finally {
    loadingFleets.value = false;
  }
}

async function loadParticipation() {
  participation.value = partOrgId.value ? await fleetApi.participation(partOrgId.value) : [];
}

async function doCreateFleet() {
  if (!fleetForm.orgId || !fleetForm.title) return ElMessage.warning('请填写必填项');
  await fleetApi.create({ ...fleetForm, orgType: 'corporation', status: 'draft' });
  ElMessage.success('舰队已创建');
  fleetVisible.value = false;
  loadFleets();
}

async function openDetail(row: any) {
  detail.value = await fleetApi.detail(row.id);
  detailVisible.value = true;
}

async function sendPing(row: any) {
  await ElMessageBox.confirm('确认发送集结 Ping（Discord 推送）？', '集结 Ping');
  await fleetApi.ping(row.id, 'discord');
  ElMessage.success('Ping 已发送');
  loadFleets();
}

async function doSignup() {
  if (!signupName.value) return ElMessage.warning('请输入角色名');
  await fleetApi.signup({ fleetId: detail.value.id, characterId: 0, characterName: signupName.value, role: signupRole.value });
  ElMessage.success('已登记');
  signupName.value = '';
  detail.value = await fleetApi.detail(detail.value.id);
}

async function toggleAttendance(row: any) {
  await fleetApi.attendance(row.id, !row.attended);
  detail.value = await fleetApi.detail(detail.value.id);
}

function fleetStatusLabel(s: string) {
  return { draft: '筹备', active: '集结中', ended: '已结束' }[s] || s;
}
function fleetStatusType(s: string) {
  return { draft: 'info', active: 'warning', ended: 'success' }[s] || 'info';
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.detail-title { font-size: 16px; font-weight: 600; color: #eef2ff; margin-bottom: 6px; }
.detail-meta { display: flex; gap: 20px; color: #7d89a8; font-size: 13px; margin-bottom: 14px; }
.signup-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.signup-table { margin-bottom: 12px; }
.aar { font-size: 13px; color: #c6cfe8; background: #0f1630; border-radius: 8px; padding: 10px; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
</style>
