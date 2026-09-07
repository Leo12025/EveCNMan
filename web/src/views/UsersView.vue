<template>
  <div>
    <el-alert
      v-if="!isSuperAdmin"
      type="warning"
      :closable="false"
      title="仅超级管理员（super_admin）可访问用户管理"
    />
    <template v-else>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">平台账号与用户（{{ users.length }}）</div>
          <el-button type="primary" size="small" @click="openCreate">新建平台账号</el-button>
        </div>
        <div class="panel-sub">
          身份主体分为两类：<b>平台账号</b>（用户名+密码登录，名下可聚合多个 EVE 角色并拥有其权限并集）与
          <b>EVE 角色身份</b>（EVE SSO 登录自动创建，仅拥有该角色自身权限）。
        </div>
        <el-table :data="users" class="dark-table" v-loading="loading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.kind === 'platform'" size="small" type="warning" effect="plain">平台账号</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">EVE 角色</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="名称" min-width="220">
            <template #default="{ row }">
              <div v-if="row.kind === 'eve'" class="eve-cell">
                <span class="char-name">{{ row.characterName || row.username.replace(/^eve:/, '') }}</span>
                <span class="char-sub">{{ row.username }}</span>
              </div>
              <span v-else>{{ row.username }}</span>
            </template>
          </el-table-column>
          <el-table-column label="角色" width="200">
            <template #default="{ row }">
              <el-select v-model="row.role" size="small" style="width: 150px" @change="(r: string) => setRole(row, r)">
                <el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="230" align="center">
            <template #default="{ row }">
              <template v-if="row.kind === 'platform'">
                <el-button size="small" @click="openReset(row)">重置密码</el-button>
              </template>
              <el-button size="small" type="danger" plain :disabled="row.id === meId" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <el-dialog v-model="createVisible" title="新建平台账号" width="460px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" placeholder="登录用户名（不能以 eve: 开头）" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetVisible" title="重置密码" width="460px">
      <p class="reset-tip">为平台账号 <b>{{ resetRow?.username }}</b> 设置新密码（至少 6 位）：</p>
      <el-input v-model="resetPassword" type="password" show-password placeholder="新密码" @keyup.enter="submitReset" />
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReset">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userApi } from '../api';
import { fmtDateTime } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
/** 是否超管（响应式：刷新后 /auth/me 加载完成会自动变为 true 并加载列表） */
const isSuperAdmin = computed(() => store.user?.role === 'super_admin');
const meId = computed(() => store.user?.id);

const users = ref<any[]>([]);
const loading = ref(false);
const roles = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '成员' },
  { value: 'viewer', label: '只读' },
];

const createVisible = ref(false);
const resetVisible = ref(false);
const submitting = ref(false);
const form = reactive({ username: '', password: '', role: 'member' });
const resetRow = ref<any>(null);
const resetPassword = ref('');

onMounted(load);

async function load() {
  if (!isSuperAdmin.value) return;
  loading.value = true;
  try {
    users.value = await userApi.list();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.username = '';
  form.password = '';
  form.role = 'member';
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.username.trim()) return ElMessage.warning('请输入用户名');
  if (form.password.length < 6) return ElMessage.warning('密码至少 6 位');
  submitting.value = true;
  try {
    await userApi.create({ username: form.username.trim(), password: form.password, role: form.role });
    ElMessage.success('平台账号已创建，可使用用户名 + 密码登录');
    createVisible.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    submitting.value = false;
  }
}

function openReset(row: any) {
  resetRow.value = row;
  resetPassword.value = '';
  resetVisible.value = true;
}

async function submitReset() {
  if (resetPassword.value.length < 6) return ElMessage.warning('密码至少 6 位');
  submitting.value = true;
  try {
    const res = await userApi.resetPassword(resetRow.value.id, resetPassword.value);
    if (res.error) return ElMessage.error(res.error);
    ElMessage.success('密码已重置');
    resetVisible.value = false;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '重置失败');
  } finally {
    submitting.value = false;
  }
}

async function setRole(row: any, role: string) {
  try {
    await userApi.setRole(row.id, role);
    ElMessage.success(`已将 ${displayName(row)} 设为 ${roles.find((r) => r.value === role)?.label}`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '操作失败');
    load();
  }
}

/** 展示名：EVE 角色身份显示角色名，平台账号显示用户名 */
function displayName(row: any) {
  if (row.kind === 'eve') return row.characterName || row.username.replace(/^eve:/, '');
  return row.username;
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确认删除用户 ${displayName(row)}？`, '提示', { type: 'warning' });
  try {
    await userApi.remove(row.id);
    ElMessage.success('已删除');
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '操作失败');
  }
}
</script>

<style scoped>
.panel {
  background: #121a33;
  border: 1px solid #1e2942;
  border-radius: 10px;
  padding: 16px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #c6cfe8;
}
.panel-sub {
  font-size: 12px;
  color: #7d89a8;
  margin-bottom: 12px;
}
.panel-sub b {
  color: #e8a23d;
}
.reset-tip {
  color: #c6cfe8;
  font-size: 13px;
  margin: 0 0 12px;
}
.eve-cell {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.eve-cell .char-name {
  color: #e8a23d;
  font-weight: 600;
}
.eve-cell .char-sub {
  font-size: 11px;
  color: #5d6b8f;
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
