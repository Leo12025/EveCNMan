<template>
  <div v-loading="loading">
    <template v-if="memberDetail || profile">
      <div class="hero">
        <el-avatar :size="72" :src="displayAvatar" class="hero-avatar">{{ displayName?.slice(0, 1) }}</el-avatar>
        <div class="hero-info">
          <div class="hero-name">
            {{ displayName }}
            <el-tag v-if="boundAccount" size="small" type="success" effect="dark" style="margin-left: 8px; vertical-align: 3px">ESI 已绑定</el-tag>
            <el-tag v-else size="small" type="info" effect="plain" style="margin-left: 8px; vertical-align: 3px">未绑定 ESI</el-tag>
          </div>
          <div class="hero-meta">
            {{ displayCorp }}<span v-if="displayAlliance"> · {{ displayAlliance }}</span>
          </div>
          <div class="hero-sub">
            <span class="muted">角色ID：{{ characterId }}</span>
            <el-tag v-if="boundAccount && full" size="small" :type="full.tokenExpired ? 'danger' : 'success'" effect="plain">
              {{ full.tokenExpired ? 'Token 已失效' : 'Token 有效' }}
            </el-tag>
            <el-tag v-if="boundAccount && full" size="small" effect="plain" :type="full.auth?.personal ? 'success' : 'info'">
              个人{{ full.auth?.personal ? '已授权' : '未授权' }}
            </el-tag>
            <el-tooltip v-if="boundAccount && full" :content="full.auth?.corp ? '该账号具备军团管理 scope，可参与军团级数据同步' : '该账号仅个人授权，军团级数据同步不会使用该角色'" placement="top">
              <el-tag size="small" effect="plain" :type="full.auth?.corp ? 'warning' : 'info'">
                军团{{ full.auth?.corp ? '已授权' : '未授权' }}
              </el-tag>
            </el-tooltip>
            <span v-if="full" class="muted">钱包余额：{{ full.balance != null ? fmtIsk(full.balance) : '未同步' }}</span>
            <span v-if="boundAccount" class="muted">最后同步：{{ fmtDateTime(boundAccount.lastSyncedAt) }}</span>
          </div>
        </div>
        <div class="hero-actions">
          <el-button size="small" type="primary" plain :disabled="!boundAccount" @click="doSync" :loading="syncing">同步数据</el-button>
        </div>
      </div>

      <el-row :gutter="16" class="cards">
        <el-col :span="6"><div class="stat-card"><div class="stat-label">总技能点</div><div class="stat-value">{{ totalSp != null ? fmtNumber(totalSp) : '-' }}</div></div></el-col>
        <el-col :span="6"><div class="stat-card"><div class="stat-label">安全等级</div><div class="stat-value small">
          <span v-if="securityStatus != null" :style="{ color: securityStatus < 0 ? '#ff6b6b' : '#06d6a0' }">{{ securityStatus.toFixed(2) }}</span>
          <span v-else>-</span>
        </div></div></el-col>
        <el-col :span="6"><div class="stat-card"><div class="stat-label">活跃分级</div><div class="stat-value small">
          <el-tag v-if="memberships.length" size="small" :type="tierType(memberships[0].activityTier)">{{ tierLabel(memberships[0].activityTier) }}</el-tag>
          <span v-else>-</span>
        </div></div></el-col>
        <el-col :span="6"><div class="stat-card"><div class="stat-label">最近登录</div><div class="stat-value small">{{ lastLogin ? fmtDate(lastLogin) : '-' }}</div></div></el-col>
      </el-row>

      <div class="panel block-row">
        <div class="panel-title">公开档案<el-tag size="small" effect="plain" style="margin-left: 8px">ESI</el-tag></div>
        <div class="kv-grid">
          <div class="kv"><span class="kv-label">出生日期</span><span class="kv-value">{{ profile?.birthday || '-' }}</span></div>
          <div class="kv"><span class="kv-label">性别</span><span class="kv-value">{{ genderText(profile?.gender) }}</span></div>
          <div class="kv"><span class="kv-label">种族 / 血统</span><span class="kv-value">{{ [profile?.raceName, profile?.bloodlineName].filter(Boolean).join(' / ') || '-' }}</span></div>
          <div class="kv"><span class="kv-label">当前军团</span><span class="kv-value">
            {{ profile?.corporationName || boundAccount?.corporationName || '-' }}
            <span v-if="profile?.corporationTicker" class="kv-ticker">[{{ profile.corporationTicker }}]</span>
          </span></div>
          <div class="kv"><span class="kv-label">所属联盟</span><span class="kv-value">
            {{ profile?.allianceName || boundAccount?.allianceName || '-' }}
            <span v-if="profile?.allianceTicker" class="kv-ticker">[{{ profile.allianceTicker }}]</span>
          </span></div>
          <div class="kv"><span class="kv-label">军团职位</span><span class="kv-value">
            <template v-if="memberRoles.length">
              <el-tag v-for="r in memberRoles.slice(0, 6)" :key="r" size="small" class="role-tag" :type="r === 'Director' || r === 'CEO' ? 'warning' : 'info'">{{ r }}</el-tag>
            </template>
            <span v-else>普通成员</span>
          </span></div>
        </div>
      </div>

      <div class="panel block-row">
        <div class="panel-title">成员记录（{{ memberships.length }}）</div>
        <el-table v-if="memberships.length" :data="memberships" :class="'dark-table'" size="small" max-height="300">
          <el-table-column label="组织" min-width="190">
            <template #default="{ row }">
              <span style="color: #c6cfe8">{{ row.orgName || `#${row.orgId}` }}</span>
              <span v-if="row.orgTicker" class="ticker-inline">[{{ row.orgTicker }}]</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="80" align="center">
            <template #default="{ row }">{{ row.orgType === 'alliance' ? '联盟' : '军团' }}</template>
          </el-table-column>
          <el-table-column label="军团职位" min-width="150">
            <template #default="{ row }">
              <el-tag v-for="r in row.roles.slice(0, 3)" :key="r" size="small" class="role-tag" :type="r === 'Director' || r === 'CEO' ? 'warning' : 'info'">{{ r }}</el-tag>
              <span v-if="!row.roles.length" class="muted">普通成员</span>
            </template>
          </el-table-column>
          <el-table-column label="标记" min-width="130">
            <template #default="{ row }">
              <el-tag v-for="t in (row.tags || [])" :key="t" size="small" effect="plain" class="role-tag" type="primary">{{ t }}</el-tag>
              <span v-if="!(row.tags || []).length" class="muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="入团时间" width="120">
            <template #default="{ row }">{{ fmtDate(row.joinedAt) }}</template>
          </el-table-column>
          <el-table-column label="最近登录" width="120">
            <template #default="{ row }">{{ fmtDate(row.lastLogin) }}</template>
          </el-table-column>
          <el-table-column label="本月军税" width="110" align="right">
            <template #default="{ row }">{{ fmtNumber(row.monthlyTax) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="86" align="center">
            <template #default="{ row }">
              <el-tag :type="row.isActive ? 'success' : 'danger'" size="small" effect="plain">{{ row.isActive ? '活跃' : '离团' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.note || '-' }}</template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-hint">该角色不在当前管理的军团/联盟中</div>
      </div>

      <template v-if="boundAccount && full?.snapshot">
        <div class="panel block-row" style="margin-top: 16px">
          <div class="panel-title">授权数据<el-tag size="small" effect="plain" style="margin-left: 8px">来自角色同步快照</el-tag></div>
        </div>

        <el-row :gutter="16" class="block-row">
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">技能（{{ skills.length }}）</div>
              <el-table :data="skills" :class="'dark-table'" max-height="320" size="small">
                <el-table-column prop="name" label="技能" min-width="170" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.name || skillName(row) }}</template>
                </el-table-column>
                <el-table-column prop="category" label="分类" width="130" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.category || '-' }}</template>
                </el-table-column>
                <el-table-column label="等级" width="80" align="center">
                  <template #default="{ row }"><el-tag size="small">{{ row.level ?? row.active_skill_level }}</el-tag></template>
                </el-table-column>
                <el-table-column label="SP" width="110" align="right">
                  <template #default="{ row }">{{ fmtNumber(row.sp ?? row.skillpoints_in_skill) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">技能队列（{{ queue.length }}）</div>
              <el-table :data="queue" :class="'dark-table'" max-height="320" size="small">
                <el-table-column prop="name" label="技能" min-width="170" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.name || skillName(row) }}</template>
                </el-table-column>
                <el-table-column prop="category" label="分类" width="130" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.category || '-' }}</template>
                </el-table-column>
                <el-table-column label="目标" width="80" align="center">
                  <template #default="{ row }">{{ row.level ?? row.finished_level }}</template>
                </el-table-column>
                <el-table-column label="完成" width="170">
                  <template #default="{ row }">{{ row.finishDate || row.finish_date ? fmtDateTime(row.finishDate || row.finish_date) : '-' }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="16" class="block-row">
          <el-col :span="8">
            <div class="panel">
              <div class="panel-title">克隆体（{{ clones.length }}）</div>
              <el-table :data="clones" :class="'dark-table'" max-height="240" size="small">
                <el-table-column label="克隆位置" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">{{ locationText(row) }}</template>
                </el-table-column>
                <el-table-column label="植入体" min-width="160">
                  <template #default="{ row }">{{ implantsText(row) || '-' }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="panel">
              <div class="panel-title">忠诚点</div>
              <el-table :data="loyalty" :class="'dark-table'" max-height="240" size="small">
                <el-table-column label="军团" min-width="170" show-overflow-tooltip>
                  <template #default="{ row }">{{ corporationText(row) }}</template>
                </el-table-column>
                <el-table-column label="LP" width="110" align="right">
                  <template #default="{ row }">{{ fmtNumber(row.points ?? row.loyalty_points) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="panel">
              <div class="panel-title">军团职位（ESI 快照）</div>
              <div class="roles-wrap">
                <el-tag v-for="r in snapshotRoles" :key="r.name || r.role" class="role-tag" :type="['Director', 'CEO'].includes(r.name || r.role) ? 'warning' : 'info'">
                  {{ r.name || r.role }}
                </el-tag>
                <span v-if="!snapshotRoles.length" class="muted">普通成员</span>
              </div>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="16" class="block-row">
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">工业任务（{{ industry.length }}）</div>
              <el-table :data="industry" :class="'dark-table'" max-height="260" size="small">
                <el-table-column label="类型" width="90">
                  <template #default="{ row }">{{ industryActivityText(row) }}</template>
                </el-table-column>
                <el-table-column label="产物" min-width="150" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div>{{ productText(row) }}</div>
                    <div v-if="row.productCategory" class="muted">{{ row.productCategory }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }"><el-tag size="small" :type="(row.status === 'active') === false ? 'info' : 'success'">{{ row.status === 'active' ? '生产中' : (row.status || '-') }}</el-tag></template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="panel">
              <div class="panel-title">资产概览</div>
              <div class="asset-summary" v-if="assetSummary">
                <div><span class="muted">资产种类</span><b>{{ assetSummary.typeCount }}</b></div>
                <div><span class="muted">资产数量</span><b>{{ fmtNumber(assetSummary.count) }}</b></div>
                <div><span class="muted">估算总价值</span><b>{{ fmtIsk(assetSummary.totalValue) }}</b></div>
              </div>
              <div class="top-assets" v-if="assetSummary?.byType?.length">
                <div class="muted" style="margin-bottom: 6px">价值最高的资产</div>
                <div v-for="t in assetSummary.byType.slice(0, 5)" :key="t.type" class="asset-row">
                  <span>{{ t.type }}</span>
                  <span>{{ fmtIsk(t.value) }}</span>
                </div>
              </div>
              <div v-if="!assetSummary" class="empty-hint">暂无资产数据（点击右上角「同步数据」拉取）</div>
            </div>
          </el-col>
        </el-row>
      </template>

      <div v-else-if="boundAccount" class="panel block-row" style="margin-top: 16px">
        <div class="empty-hint" style="padding: 24px">该角色已绑定 ESI，但还没有同步过快照数据 —— 点击右上角「同步数据」即可拉取技能 / 位置 / 钱包 / 资产等信息。</div>
      </div>
      <div v-else class="panel block-row" style="margin-top: 16px">
        <div class="empty-hint" style="padding: 24px">该成员尚未绑定 ESI 账号。绑定后可展示技能、技能队列、位置、钱包、资产等完整数据（成员档案与军团职位为管理侧快照，随时可见）。</div>
      </div>
    </template>
    <el-empty v-else-if="!loading" description="未找到该成员档案（角色需存在于成员管理中）" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { esiApi, assetApi, memberApi } from '../api';
import { fmtIsk, fmtNumber, fmtDate, fmtDateTime } from '../utils/format';

const route = useRoute();
const characterId = Number(route.params.id);
const loading = ref(false);
const syncing = ref(false);

const profile = ref<any>(null);
const memberDetail = ref<any>(null);
const full = ref<any>(null);
const assetSummary = ref<any>(null);

const memberships = computed(() => memberDetail.value?.memberships || []);
const boundAccount = computed(() => memberDetail.value?.boundAccount || null);

const displayName = computed(() => profile.value?.name || memberDetail.value?.characterName || full.value?.characterName || `角色 #${characterId}`);
const displayAvatar = computed(() => profile.value?.portraitUrl || boundAccount.value?.avatarUrl || '');
const displayCorp = computed(
  () => profile.value?.corporationName || boundAccount.value?.corporationName || memberships.value.find((m: any) => m.orgType === 'corporation')?.orgName || '-',
);
const displayAlliance = computed(() => profile.value?.allianceName || boundAccount.value?.allianceName || '-');

const securityStatus = computed(() => {
  if (profile.value?.securityStatus != null) return profile.value.securityStatus;
  const row = memberships.value.find((m: any) => m.securityStatus != null);
  return row?.securityStatus ?? null;
});
const totalSp = computed(() => {
  const s = snapshot.value;
  if (s?.skills?.totalSp != null) return s.skills.totalSp;
  const maxSp = memberships.value.reduce((mx: number, m: any) => Math.max(mx, m.sp || 0), 0);
  return maxSp || null;
});
const lastLogin = computed(() => {
  const times = memberships.value.map((m: any) => (m.lastLogin ? +new Date(m.lastLogin) : 0));
  return times.length ? new Date(Math.max(...times)) : null;
});
const memberRoles = computed(() => {
  const set = new Set<string>();
  memberships.value.forEach((m: any) => (m.roles || []).forEach((r: string) => set.add(r)));
  return [...set];
});

const snapshot = computed(() => full.value?.snapshot || null);
const skills = computed(() => snapshot.value?.skills?.skills || []);
const queue = computed(() => snapshot.value?.skillQueue || []);
const clones = computed(() => snapshot.value?.clones?.jump_clones || snapshot.value?.clones || []);
const loyalty = computed(() => snapshot.value?.loyalty || []);
const snapshotRoles = computed(() => snapshot.value?.roles || []);
const industry = computed(() => snapshot.value?.industryJobs || []);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [d, p] = await Promise.all([
      memberApi.detail(characterId).catch(() => null),
      esiApi.characterProfile(characterId).catch(() => null),
    ]);
    memberDetail.value = d;
    profile.value = p;
    if (d?.boundAccount?.id) {
      full.value = await esiApi.characterData(d.boundAccount.id).catch(() => null);
      if (snapshot.value) {
        assetSummary.value = await assetApi
          .summary({ ownerType: 'character', ownerId: characterId })
          .catch(() => null);
      }
    }
  } finally {
    loading.value = false;
  }
}

async function doSync() {
  if (!boundAccount.value) return;
  syncing.value = true;
  try {
    const res: any = await esiApi.syncCharacter(boundAccount.value.id);
    if (res?.ok) ElMessage.success(res.message || '同步完成');
    else ElMessage.warning(res?.message || '同步未完成');
    await load();
  } finally {
    syncing.value = false;
  }
}

function skillName(row: any) {
  const id = row.skill_id ?? row.typeId ?? row.type_id;
  return id ? `技能 #${id}` : '';
}
function locationText(row: any) {
  if (row.locationName) return row.locationName;
  const typeMap: any = { station: '空间站', structure: '玩家建筑', citadel: '玩家建筑', solar_system: '星系' };
  const id = row.location_id ?? row.locationId;
  const typeLabel = typeMap[row.location_type ?? row.locationType] || row.location_type || row.locationType || '';
  if (typeLabel && id != null) return `${typeLabel} #${id}`;
  if (id != null) return `位置 #${id}`;
  return row.location || '-';
}
function implantsText(row: any) {
  const arr = row.implantNames?.length ? row.implantNames : row.implants || [];
  if (!arr.length) return '';
  return arr
    .map((v: any) => {
      if (typeof v === 'number') return `#${v}`;
      return typeof v === 'string' && /^\d+$/.test(v) ? `#${v}` : v;
    })
    .join('、');
}
function corporationText(row: any) {
  if (row.corporationName) return row.corporationName;
  const id = row.corporation_id ?? row.corporationId;
  return id != null ? `军团 #${id}` : row.corporation || '-';
}
function productText(row: any) {
  if (row.productName) return row.productName;
  const id = row.product_type_id ?? row.productTypeId;
  return id != null ? `物品 #${id}` : row.product || '-';
}
function industryActivityText(row: any) {
  const m: any = { 1: '制造', 2: '研发·材料效率', 3: '研发·时间效率', 4: '复制', 5: '发明', 7: '反应', 8: '运送', 9: '逆向工程', 11: '竞赛' };
  const v = row.activity_id ?? row.activityId;
  if (m[v]) return m[v];
  return row.activity || row.activityName || '-';
}
function genderText(g: string) {
  return { male: '男', female: '女', other: '其他' }[g] || g || '-';
}
function tierLabel(t: string) {
  return { core: '核心', active: '活跃', casual: '休闲', idle: '休眠', left: '已离' }[t] || t;
}
function tierType(t: string) {
  return { core: 'success', active: 'primary', casual: 'warning', idle: 'danger', left: 'info' }[t] || 'info';
}
</script>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  background: linear-gradient(135deg, #161f3d, #11182f);
  border: 1px solid #1e2942;
  border-radius: 12px;
  margin-bottom: 16px;
}
.hero-avatar {
  background: #4f7cff;
  color: #fff;
  font-weight: 600;
}
.hero-info {
  flex: 1;
  min-width: 0;
}
.hero-name {
  font-size: 18px;
  font-weight: 600;
  color: #e8ecf8;
}
.hero-meta {
  color: #9aa5c1;
  margin-top: 2px;
}
.hero-sub {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
}
.muted {
  color: #5b6780;
  font-size: 12px;
}
.cards {
  margin-bottom: 16px;
}
.stat-card {
  background: #121a33;
  border: 1px solid #1e2942;
  border-radius: 10px;
  padding: 14px 16px;
}
.stat-label {
  font-size: 12px;
  color: #7d89a8;
  margin-bottom: 6px;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #4f7cff;
}
.stat-value.small {
  font-size: 14px;
  font-weight: 500;
  color: #c6cfe8;
  min-height: 24px;
}
.block-row {
  margin-bottom: 16px;
}
.panel {
  background: #121a33;
  border: 1px solid #1e2942;
  border-radius: 10px;
  padding: 14px 16px;
  height: 100%;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #c6cfe8;
  margin-bottom: 10px;
}
.kv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px 24px;
}
.kv {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
}
.kv-label {
  color: #7d89a8;
  flex-shrink: 0;
  width: 72px;
}
.kv-value {
  color: #c6cfe8;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kv-ticker {
  color: #5b6780;
  margin-left: 4px;
  font-size: 12px;
}
.empty-hint {
  color: #5b6780;
  font-size: 13px;
  text-align: center;
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
  margin-bottom: 4px;
}
.roles-wrap {
  line-height: 2;
}
.ticker-inline {
  color: #5b6780;
  font-size: 12px;
  margin-left: 4px;
}
.asset-summary {
  display: flex;
  gap: 24px;
  margin-bottom: 14px;
}
.asset-summary b {
  display: block;
  font-size: 18px;
  color: #06d6a0;
  margin-top: 4px;
}
.top-assets .asset-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid #1e2942;
  font-size: 13px;
  color: #c6cfe8;
}
</style>
