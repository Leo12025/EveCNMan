<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="变动流水" name="logs">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-select v-model="query.action" placeholder="类型" clearable size="small" style="width: 130px" @change="load">
              <el-option label="取走" value="take" />
              <el-option label="转移" value="move" />
              <el-option label="存入" value="deposit" />
              <el-option label="消耗" value="consume" />
              <el-option label="归还" value="return" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="logVisible = true">登记取走</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="items" size="small" style="width: 100%" :class="'dark-table'" v-loading="loading">
            <el-table-column prop="typeName" label="物品" min-width="150" />
            <el-table-column label="数量" width="80" align="right">
              <template #default="{ row }">{{ row.quantity.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="动作" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="actionType(row.action)">{{ actionLabel(row.action) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="actorName" label="操作人" width="110">
              <template #default="{ row }">{{ row.actorName || '-' }}</template>
            </el-table-column>
            <el-table-column prop="fromLocation" label="来源" min-width="110" />
            <el-table-column prop="toLocation" label="去向" min-width="110" />
            <el-table-column prop="note" label="说明" min-width="150" show-overflow-tooltip />
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="total, prev, pager, next" class="pager" @current-change="onPage" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="材料缺口" name="gaps">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="gapOrgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadGaps">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="needVisible = true">设置材料</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="gaps" size="small" style="width: 100%" :class="'dark-table'" v-loading="loadingGaps">
            <el-table-column prop="typeName" label="材料" min-width="160" />
            <el-table-column label="现有库存" width="100" align="right">
              <template #default="{ row }">{{ row.have.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="目标库存" width="100" align="right">
              <template #default="{ row }">{{ row.target.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="缺口" width="100" align="right">
              <template #default="{ row }">
                <span :class="{ shortage: row.gap > 0 }">{{ row.gap.toLocaleString() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.shortage ? 'danger' : 'success'">{{ row.shortage ? '缺口' : '充足' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!gaps.length" class="empty">暂无缺口监控项，点击右上角"设置材料"添加</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 登记取走 -->
    <el-dialog v-model="logVisible" title="登记资产变动" width="480px">
      <el-form :model="logForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="logForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="物品名" required><el-input v-model="logForm.typeName" /></el-form-item>
        <el-form-item label="TypeID"><el-input-number v-model="logForm.typeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="logForm.quantity" :min="1" style="width: 100%" /></el-form-item>
        <el-form-item label="操作人"><el-input v-model="logForm.actorName" /></el-form-item>
        <el-form-item label="去向"><el-input v-model="logForm.toLocation" placeholder="如：Jita 4-4" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="logForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="logVisible = false">取消</el-button>
        <el-button type="primary" @click="doLogTake">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设置材料 -->
    <el-dialog v-model="needVisible" title="设置材料目标" width="480px">
      <el-form :model="needForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="needForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名" required><el-input v-model="needForm.typeName" /></el-form-item>
        <el-form-item label="TypeID" required><el-input-number v-model="needForm.typeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="目标量"><el-input-number v-model="needForm.target" :min="0" :step="1000" style="width: 100%" /></el-form-item>
        <el-form-item label="预警阈值"><el-input-number v-model="needForm.threshold" :min="0" :step="1000" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="needVisible = false">取消</el-button>
        <el-button type="primary" @click="doNeed">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { assetApi, orgApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('logs');
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const gaps = ref<any[]>([]);
const loadingGaps = ref(false);
const gapOrgId = ref<number | undefined>(undefined);
const logVisible = ref(false);
const needVisible = ref(false);
const query = reactive({ orgId: undefined as number | undefined, action: undefined as string | undefined });
const logForm = reactive({ orgId: undefined as number | undefined, typeName: '', typeId: 0, quantity: 1, actorName: '', toLocation: '', note: '' });
const needForm = reactive({ orgId: undefined as number | undefined, typeName: '', typeId: 0, target: 10000, threshold: 2000 });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
  loadGaps();
});

async function load() {
  loading.value = true;
  try {
    const res = await assetApi.logs({ ...query, page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadGaps() {
  loadingGaps.value = true;
  try {
    gaps.value = gapOrgId.value ? await assetApi.gaps(gapOrgId.value) : [];
  } finally {
    loadingGaps.value = false;
  }
}

function onPage(p: number) {
  page.value = p;
  load();
}

function actionLabel(a: string) {
  return { take: '取走', move: '转移', deposit: '存入', consume: '消耗', return: '归还' }[a] || a;
}
function actionType(a: string) {
  return { take: 'danger', move: 'warning', deposit: 'success', consume: 'info', return: 'primary' }[a] || 'info';
}

async function doLogTake() {
  if (!logForm.orgId || !logForm.typeName) return ElMessage.warning('请填写军团与物品');
  await assetApi.logTake({ orgType: 'corporation', orgId: logForm.orgId, itemId: 0, typeId: logForm.typeId, typeName: logForm.typeName, quantity: logForm.quantity, actorName: logForm.actorName, toLocation: logForm.toLocation, note: logForm.note });
  ElMessage.success('已登记');
  logVisible.value = false;
  load();
}

async function doNeed() {
  if (!needForm.orgId || !needForm.typeName) return ElMessage.warning('请填写军团与材料');
  await assetApi.upsertNeed({ orgType: 'corporation', orgId: needForm.orgId, typeName: needForm.typeName, typeId: needForm.typeId, target: needForm.target, threshold: needForm.threshold, source: 'manual' });
  ElMessage.success('已保存');
  needVisible.value = false;
  loadGaps();
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.shortage { color: #e5484d; font-weight: 600; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
