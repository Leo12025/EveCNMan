<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="14">
        <div class="panel">
          <div class="panel-title">EVE 国服 SSO / ESI 连接</div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="SSO Client">
              <el-tag :type="ssoConfigured ? 'success' : 'info'" size="small">
                {{ ssoConfigured ? (cfg.defaultClient ? '已内置官方 ESI 客户端（开箱即用）' : '已配置（真实 ESI 模式）') : '未配置（演示模式）' }}
              </el-tag>
              <span v-if="cfg.clientId" class="muted" style="margin-left: 8px">client_id: {{ cfg.clientId }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="ESI 数据接口">ali-esi.evepc.163.com（官方已迁移）</el-descriptions-item>
            <el-descriptions-item label="回调地址">{{ cfg.callbackUrl }}</el-descriptions-item>
            <el-descriptions-item v-if="ssoConfigured" label="个人授权 Scope（登录/绑定默认）">
              <el-tag v-for="s in cfg.personalScopes || cfg.scopes" :key="s" size="small" class="scope-tag" type="success" effect="plain">{{ s }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="ssoConfigured && (cfg.corpScopes || []).length" label="军团授权 Scope（二次授权追加）">
              <el-tag v-for="s in cfg.corpScopes" :key="s" size="small" class="scope-tag" type="warning" effect="plain">{{ s }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <template v-if="ssoConfigured">
            <div class="bind-box">
              <div class="bind-actions">
                <el-button type="primary" @click="openAuthorize">打开 SSO 授权（个人）</el-button>
                <span class="hint" style="flex: 1; line-height: 2.2">
                  <template v-if="isPlatform">
                    平台账号可把多个 EVE 角色绑定到名下，登录后即拥有这些角色权限的<b style="color:#e8a23d">并集</b>；
                    角色本身仍可独立 SSO 登录。
                  </template>
                  <template v-else>
                    当前为 EVE 角色身份（只拥有该角色自身权限），此处仅用于该角色的重新授权/升级军团授权。
                  </template>
                </span>
              </div>
              <div class="hint">
                1. 首次授权前请先访问 <code>login.evepc.163.com/account/logoff</code> 清理网易账号登录缓存；
                2. 在新窗口用网易账号登录并授权；3. 授权后浏览器停在
                <code>ali-esi.evepc.163.com/ui/oauth2-redirect.html</code>；4. 复制地址栏完整 URL 粘贴到下方点击「绑定角色」。
              </div>
              <div class="bind-row">
                <el-input v-model="bindUrl" placeholder="粘贴授权完成后地址栏的完整 URL（含 code=...）" clearable />
                <el-button type="primary" :loading="binding" @click="doBind">绑定角色</el-button>
              </div>
            </div>
          </template>
          <div v-else class="hint" style="margin-top: 12px">
            网易官方未开放申请渠道，默认复用官方 ESI 网页自带的 client_id（
            <code>bc90aa496a404724a93f41b4f4e97761</code>，第三方工具/KB网均用此 ID），可直接绑定角色；
            若官方后续开放申请，在 <code>server/.env</code> 配置 <code>EVE_SSO_CLIENT_ID</code> / <code>EVE_DEVICE_ID</code> 后重启即可。
          </div>
        </div>

        <div v-if="ssoConfigured" class="panel">
          <div class="panel-title">{{ isPlatform ? '名下 EVE 角色' : '我的 EVE 角色' }}（{{ accounts.length }}）</div>
          <el-table v-if="accounts.length" :data="accounts" style="width: 100%" :class="'dark-table'">
            <el-table-column label="角色" min-width="150">
              <template #default="{ row }">
                <div class="char-cell">
                  <img v-if="row.avatarUrl" :src="row.avatarUrl" class="avatar" alt="" />
                  <div>
                    <div>{{ row.characterName }} <el-tag v-if="row.isMain" size="small" type="success" effect="plain">主</el-tag></div>
                    <div class="muted">{{ row.corporationName }}{{ row.allianceName ? ' / ' + row.allianceName : '' }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Token" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.tokenExpired ? 'danger' : 'success'" size="small" effect="plain">
                  {{ row.tokenExpired ? '过期' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="授权状态" width="168" align="center">
              <template #default="{ row }">
                <div class="auth-cell">
                  <el-tag size="small" effect="plain" :type="row.auth?.personal ? 'success' : 'info'">
                    个人{{ row.auth?.personal ? '已授权' : '未授权' }}
                  </el-tag>
                  <el-tag size="small" effect="plain" :type="row.auth?.corp ? 'warning' : 'info'">
                    军团{{ row.auth?.corp ? '已授权' : '未授权' }}
                  </el-tag>
                  <el-button v-if="!row.auth?.corp" size="small" text type="warning" @click="corpAuth(row)">
                    军团授权
                  </el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="226" align="center">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="syncAccount(row)">同步</el-button>
                <el-button size="small" text type="warning" @click="reauth(row)">
                  {{ row.auth?.corp ? '重新授权·军团' : '重新授权·个人' }}
                </el-button>
                <el-button size="small" text @click="refreshToken(row)">刷新</el-button>
                <el-button size="small" text type="danger" @click="unbind(row)">解绑</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty
            v-else
            :description="isPlatform ? '暂无名下角色，用上方「个人授权」为角色授权并粘贴 URL 即可绑定到本平台账号' : '暂无角色，请用「打开 SSO 授权」完成首次角色登录绑定'"
            :image-size="60"
          />
        </div>

        <div class="panel">
          <div class="panel-title">演示数据管理</div>
          <div class="hint" style="margin-bottom: 8px">
            绑定真实角色后，各页面数据来自真实 ESI；未绑定时可先导入演示数据体验完整功能。
          </div>
          <el-button type="primary" plain @click="seedDemo" :loading="seeding">
            {{ demoSeeded ? '重新导入演示数据' : '导入演示数据' }}
          </el-button>
          <el-button type="danger" plain @click="clearDemo" :loading="clearing">清空示例数据</el-button>
          <div class="hint" style="margin-top: 8px">
            未配置真实 SSO 时，点击导入即可生成 2 个联盟、4 个军团的完整演示数据（成员 / 资产 / 税收）。
          </div>
        </div>
      </el-col>

      <el-col :span="10">
        <div class="panel">
          <div class="panel-title">国服服务器状态</div>
          <div v-if="serverStatus" class="status-row">
            <div class="status-item">
              <div class="status-value">{{ serverStatus.players }}</div>
              <div class="status-label">在线玩家</div>
            </div>
            <div class="status-item">
              <div class="status-value">{{ serverStatus.server_version }}</div>
              <div class="status-label">服务器版本</div>
            </div>
            <div class="status-item">
              <div class="status-value">{{ serverStatus.vip }}</div>
              <div class="status-label">VIP 在线</div>
            </div>
          </div>
          <div v-else class="hint">加载中...</div>
        </div>

        <div class="panel">
          <div class="panel-title">同步日志</div>
          <el-timeline>
            <el-timeline-item
              v-for="log in logs"
              :key="log.id"
              :type="log.status === 'success' ? 'success' : 'danger'"
              :timestamp="fmtDateTime(log.createdAt)"
            >
              {{ log.source }} #{{ log.entityId }} — {{ log.message }}
            </el-timeline-item>
          </el-timeline>
          <el-empty v-if="!logs.length" description="暂无同步记录" :image-size="60" />
        </div>

        <div class="panel">
          <div class="panel-title">权限说明</div>
          <el-table :data="roleDesc" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="role" label="角色" width="110" />
            <el-table-column prop="desc" label="权限" />
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, esiApi, configApi } from '../api';
import { fmtDateTime } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
/** 身份主体：平台账号=true（密码登录，名下多角色并集）；EVE 角色身份=false */
const isPlatform = computed(() => store.user?.kind === 'platform');
const logs = ref<any[]>([]);
const demoSeeded = ref(false);
const seeding = ref(false);
const clearing = ref(false);
const binding = ref(false);
const ssoConfigured = ref(false);
const bindUrl = ref('');
const accounts = ref<any[]>([]);
const serverStatus = ref<any>(null);
const cfg = ref<any>({});

const roleDesc = [
  { role: 'super_admin', desc: '全部权限，含组织管理、数据导入' },
  { role: 'admin', desc: '组织/成员/税务管理，数据同步' },
  { role: 'member', desc: '查看仪表盘、成员、资产、税收' },
  { role: 'viewer', desc: '只读浏览' },
];

onMounted(async () => {
  const [logsRes, c] = await Promise.all([esiApi.logs(), configApi.get()]);
  logs.value = logsRes;
  cfg.value = c;
  ssoConfigured.value = c.ssoConfigured;
  demoSeeded.value = logsRes.some((l) => l.source === 'corporation');
  loadAccounts();
  loadStatus();
});

async function loadAccounts() {
  try {
    accounts.value = await authApi.accounts();
  } catch {
    accounts.value = [];
  }
}

async function loadStatus() {
  try {
    serverStatus.value = await esiApi.status();
  } catch {
    serverStatus.value = null;
  }
}

/** 弹窗打开个人授权页（先同步开窗避免被浏览器拦截，授权完成后回填下方输入框） */
async function openAuthorize() {
  const win = window.open('about:blank', '_blank', 'noopener=no');
  if (!win) {
    ElMessage.warning('弹窗被浏览器拦截，请允许本站弹出新窗口后重试');
    return;
  }
  try {
    const { url } = await authApi.authorizeUrl({ scope: 'personal' });
    win.location.href = url;
    ElMessage.info('已在新窗口打开 EVE 授权页面（个人授权），授权完成后请立即复制地址栏 URL 粘贴到下方输入框（授权码有效期很短）');
  } catch (e: any) {
    win.close();
    ElMessage.error(e?.message || '无法生成授权链接');
  }
}

async function doBind() {
  if (!bindUrl.value.trim()) {
    ElMessage.warning('请先粘贴授权回调 URL');
    return;
  }
  binding.value = true;
  try {
    const me = await authApi.bindCode(bindUrl.value.trim());
    store.user = me;
    bindUrl.value = '';
    ElMessage.success('角色绑定成功');
    loadAccounts();
  } finally {
    binding.value = false;
  }
}

async function syncAccount(row: any) {
  const res = await esiApi.syncCharacter(row.id);
  ElMessage.success(res.message);
}

/** 行内发起个人/军团授权：打开授权页 → 粘贴回调 URL → 提交授权（覆盖该角色的授权 scope） */
async function rowAuth(row: any, kind: 'personal' | 'corp', title: string) {
  const win = window.open('about:blank', '_blank', 'noopener=no');
  if (!win) {
    ElMessage.warning('弹窗被浏览器拦截，请允许本站弹出新窗口后重试');
    return;
  }
  try {
    const { url } = await authApi.authorizeUrl({ scope: kind, state: `reauth:${row.id}` });
    win.location.href = url;
    ElMessage.info(
      kind === 'corp'
        ? `已打开「${row.characterName}」的军团授权页面（个人 scope + 军团管理 scope），授权完成后请立即复制地址栏 URL`
        : `已打开「${row.characterName}」的个人授权页面，授权完成后请立即复制地址栏 URL`,
    );
    await ElMessageBox.prompt(
      kind === 'corp'
        ? '请粘贴军团授权完成后地址栏的完整 URL（授权码有效期很短，请尽快提交）'
        : '请粘贴授权完成后地址栏的完整 URL（授权码有效期很短，请尽快提交）',
      title,
      { inputType: 'textarea', confirmButtonText: '提交授权' },
    ).then(async ({ value }) => {
      const me = await authApi.bindCode(value.trim());
      store.user = me;
      ElMessage.success(kind === 'corp' ? '军团授权完成，该角色所在军团将可按军团级数据同步' : '授权已更新');
      loadAccounts();
    }).catch(() => {});
  } catch (e: any) {
    win.close();
    ElMessage.error(e?.message || '无法生成授权链接');
  }
}

/** 重新授权：已具备军团授权的角色沿用军团授权（避免 scope 缩水），否则按个人授权 */
async function reauth(row: any) {
  const kind: 'personal' | 'corp' = row.auth?.corp ? 'corp' : 'personal';
  await rowAuth(row, kind, kind === 'corp' ? '重新军团授权' : '重新个人授权');
}

/** 军团授权（二次授权）：个人授权基础上追加军团管理 scope，需角色具备对应军团职位 */
async function corpAuth(row: any) {
  await rowAuth(row, 'corp', '军团授权');
}

async function refreshToken(row: any) {
  await authApi.refresh(row.id);
  ElMessage.success('Token 已刷新');
  loadAccounts();
}

async function unbind(row: any) {
  await ElMessageBox.confirm(`确认解绑「${row.characterName}」？`, '提示', { type: 'warning' });
  await authApi.unbind(row.id);
  ElMessage.success('已解绑');
  loadAccounts();
}

async function seedDemo() {
  seeding.value = true;
  try {
    const res = await esiApi.seedDemo();
    ElMessage.success(`演示数据已导入：${res.orgs} 个组织，${res.members} 名成员`);
    demoSeeded.value = true;
    logs.value = await esiApi.logs();
  } finally {
    seeding.value = false;
  }
}

async function clearDemo() {
  await ElMessageBox.confirm('确认清空所有示例数据（演示组织、成员、税单、资产、钱包）？真实数据不受影响。', '提示', {
    type: 'warning',
  });
  clearing.value = true;
  try {
    const res = await esiApi.clearDemo();
    ElMessage.success(
      `已清空：组织 ${res.deletedOrgs}、成员 ${res.deletedMembers}、税单 ${res.deletedTaxes}、钱包 ${res.deletedBalances}、资产 ${res.deletedAssets}`,
    );
    demoSeeded.value = false;
    logs.value = await esiApi.logs();
  } finally {
    clearing.value = false;
  }
}
</script>

<style scoped>
.panel {
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #c6cfe8;
  margin-bottom: 12px;
}
.hint {
  font-size: 12px;
  color: #5b6780;
  line-height: 1.8;
}
.hint code {
  background: #16203c;
  padding: 2px 6px;
  border-radius: 4px;
  color: #8fa8ff;
}
.bind-box {
  margin-top: 14px;
  padding: 14px;
  background: #0f1630;
  border: 1px dashed #2a3550;
  border-radius: 8px;
}
.bind-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.auth-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.bind-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.char-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
}
.muted {
  font-size: 12px;
  color: #5b6780;
}
.scope-tag {
  margin: 2px;
}
.status-row {
  display: flex;
  gap: 12px;
}
.status-item {
  flex: 1;
  padding: 14px;
  background: #0f1630;
  border-radius: 8px;
  text-align: center;
}
.status-value {
  font-size: 20px;
  font-weight: 700;
  color: #eef2ff;
}
.status-label {
  font-size: 12px;
  color: #5b6780;
  margin-top: 4px;
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
