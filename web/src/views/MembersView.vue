<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="load">
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-input v-model="query.search" placeholder="搜索成员名" clearable size="small" style="width: 180px" @input="load" />
        <el-select v-model="query.sortBy" size="small" style="width: 140px" @change="load">
          <el-option label="按 SP 排序" value="sp" />
          <el-option label="按税贡排序" value="monthlyTax" />
          <el-option label="按最近登录" value="lastLogin" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-tag size="small" type="info">共 {{ total }} 人</el-tag>
        <template v-if="Object.keys(tierStats).length">
          <el-tag size="small" type="success">核心 {{ tierStats.core || 0 }}</el-tag>
          <el-tag size="small" type="primary">活跃 {{ tierStats.active || 0 }}</el-tag>
          <el-tag size="small" type="warning">休闲 {{ tierStats.casual || 0 }}</el-tag>
          <el-tag size="small" type="danger">休眠 {{ tierStats.idle || 0 }}</el-tag>
        </template>
      </div>
    </div>

    <el-table :data="items" style="width: 100%" :class="'dark-table'" v-loading="loading">
      <el-table-column prop="characterName" label="成员" min-width="160">
        <template #default="{ row }">
          <a class="member-link" @click="openDetail(row)">{{ row.characterName }}</a>
        </template>
      </el-table-column>
      <el-table-column label="ESI 绑定" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.bound" size="small" type="success" effect="dark">已绑定</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="标记" min-width="140">
        <template #default="{ row }">
          <el-tag v-for="t in row.tags || []" :key="t" size="small" class="role-tag">{{ t }}</el-tag>
          <span v-if="!(row.tags || []).length" class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.note || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
      <el-table-column label="SP" width="120" align="right" sortable :sort-by="'sp'">
        <template #default="{ row }">{{ fmtNumber(row.sp) }}</template>
      </el-table-column>
      <el-table-column label="安全等级" width="90" align="center">
        <template #default="{ row }">
          <span :style="{ color: (row.securityStatus ?? 0) < 0 ? '#ff6b6b' : '#06d6a0' }">
            {{ (row.securityStatus ?? 0).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="本月军税" width="120" align="right">
        <template #default="{ row }">{{ fmtNumber(row.monthlyTax) }}</template>
      </el-table-column>
      <el-table-column label="活跃度" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="tierType(row.activityTier)">{{ tierLabel(row.activityTier) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="军团职位" min-width="140">
        <template #default="{ row }">
          <el-tag v-for="r in row.roles.slice(0, 3)" :key="r" size="small" class="role-tag" :type="r === 'Director' || r === 'CEO' ? 'warning' : 'info'">
            {{ r }}
          </el-tag>
          <span v-if="row.roles.length === 0" class="muted">普通成员</span>
        </template>
      </el-table-column>
      <el-table-column label="最近登录" width="110">
        <template #default="{ row }">{{ fmtDate(row.lastLogin) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small" effect="plain">
            {{ row.isActive ? '活跃' : '离团' }}
          </el-tag>
        </template>
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

    <el-dialog v-model="editVisible" title="编辑成员" width="440px">
      <el-form label-width="60px">
        <el-form-item label="备注">
          <el-input v-model="editForm.note" type="textarea" :rows="3" placeholder="分工、职责等说明" />
        </el-form-item>
        <el-form-item label="标记">
          <el-input v-model="editForm.tags" placeholder="用逗号分隔，如：核心成员, 新人" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { memberApi, orgApi } from '../api';
import { fmtNumber, fmtDate } from '../utils/format';

const router = useRouter();
const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const orgOptions = ref<any[]>([]);
const query = reactive({ orgId: undefined as number | undefined, search: '', sortBy: 'sp', page: 1, pageSize: 20 });

const editVisible = ref(false);
const editRow = ref<any>(null);
const editForm = reactive({ note: '', tags: '' as string });
const saving = ref(false);
const tierStats = ref<Record<string, number>>({});

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  load();
  loadTiers();
});

async function load() {
  loading.value = true;
  try {
    const res = await memberApi.list(query);
    items.value = res.items.map((it: any) => ({ ...it, tags: it.tags ? JSON.parse(it.tags) : [] }));
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadTiers() {
  tierStats.value = await memberApi.tiers(query.orgId);
}

function tierLabel(t: string) {
  return { core: '核心', active: '活跃', casual: '休闲', idle: '休眠', left: '已离' }[t] || t;
}
function tierType(t: string) {
  return { core: 'success', active: 'primary', casual: 'warning', idle: 'danger', left: 'info' }[t] || 'info';
}

function openDetail(row: any) {
  router.push(`/characters/${row.characterId}`);
}

function openEdit(row: any) {
  editRow.value = row;
  editForm.note = row.note || '';
  editForm.tags = (row.tags || []).join(', ');
  editVisible.value = true;
}

async function saveEdit() {
  if (!editRow.value) return;
  saving.value = true;
  try {
    const tags = editForm.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await memberApi.update(editRow.value.characterId, { note: editForm.note, tags: JSON.stringify(tags) });
    editRow.value.note = editForm.note;
    editRow.value.tags = tags;
    editVisible.value = false;
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
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
.role-tag {
  margin-right: 4px;
}
.member-link {
  color: #4f7cff;
  cursor: pointer;
  text-decoration: none;
}
.member-link:hover {
  text-decoration: underline;
}
.muted {
  color: #5b6780;
  font-size: 12px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
