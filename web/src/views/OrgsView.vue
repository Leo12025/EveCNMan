<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="tree">组织树</el-radio-button>
          <el-radio-button value="table">列表</el-radio-button>
        </el-radio-group>
        <el-input v-model="search" placeholder="搜索组织名称 / Ticker" clearable size="small" style="width: 220px" @input="loadOrgs" />
      </div>
      <div class="toolbar-right">
        <el-tag v-if="myOrgs.length" size="small" type="info">我管理：{{ myOrgs.length }} 个组织</el-tag>
        <el-button v-if="store.isAdmin" size="small" type="primary" plain @click="openCreate">+ 添加组织</el-button>
        <el-button v-if="store.isAdmin" size="small" @click="syncAll">同步全部</el-button>
      </div>
    </div>

    <!-- 组织树视图 -->
    <div v-if="viewMode === 'tree'" class="tree-wrap">
      <div v-for="node in tree" :key="node.id" class="alliance-card">
        <div class="alliance-head">
          <div class="org-tag" :class="node.type === 'alliance' ? 'alliance' : 'corp'">
            {{ node.type === 'alliance' ? '盟' : '军' }}
          </div>
          <div class="head-main">
            <div class="org-name">
              {{ node.name }} <span class="ticker">[{{ node.ticker }}]</span>
              <el-tag v-if="node.dateFounded" size="small" type="info" effect="plain" style="margin-left: 8px">
                成立 {{ node.dateFounded }}
              </el-tag>
            </div>
            <div class="org-meta">
              {{ node.memberCount ?? node.members.length }} 名成员 · 税率 {{ taxText(node) }}
              <template v-if="node.type === 'alliance' && node.executorName">
                · 执行军团 {{ node.executorName }}<span v-if="node.executorTicker"> [{{ node.executorTicker }}]</span>
              </template>
              <template v-if="node.type === 'alliance' && node.creatorId">
                · 创建者 {{ node.creatorName || node.creatorId }}
              </template>
              <span v-if="node.type === 'corporation' && (node.ceoId || node.creatorId)" class="leader-inline">
                · CEO {{ node.ceoName || node.ceoId }}<template v-if="node.creatorId"> · 创建 {{ node.creatorName || node.creatorId }}</template>
              </span>
            </div>
            <div v-if="node.type === 'corporation' && (node.description || node.url)" class="corp-extra">
              <span v-if="node.description" class="corp-desc" :title="node.description">{{ node.description }}</span>
              <a v-if="node.url" class="corp-site" :href="node.url" target="_blank" rel="noopener noreferrer" @click.stop>官网 ↗</a>
            </div>
          </div>
          <div class="head-side">
            <el-tooltip v-if="node.type === 'corporation'" :content="node.corpAuthorized ? `已有 ${node.corpAuthCount} 名军团授权账号在籍，可按军团级数据同步` : '在籍成员中没有军团授权账号，仅公开/成员级同步'" placement="top">
              <el-tag size="small" :type="node.corpAuthorized ? 'success' : 'warning'" effect="plain">
                {{ node.corpAuthorized ? '军团授权已就绪' : '仅公开同步' }}
              </el-tag>
            </el-tooltip>
            <el-button v-if="node.type === 'alliance'" size="small" text type="primary" @click="syncOrg(node)">同步联盟</el-button>
            <el-button v-else size="small" text type="primary" @click="syncOrg(node)">同步</el-button>
          </div>
        </div>
        <div class="corp-list">
          <div v-for="corp in node.children" :key="corp.id" class="corp-row">
            <div class="org-tag corp">军</div>
            <div class="corp-info">
                <div class="corp-name">
                {{ corp.name }} <span class="ticker">[{{ corp.ticker }}]</span>
                <el-tag v-if="corp.isExecutor" size="small" type="danger" effect="plain" style="margin-left: 8px">执行军团</el-tag>
                <el-tag v-if="corp.dateFounded" size="small" type="info" effect="plain" style="margin-left: 8px">成立 {{ corp.dateFounded }}</el-tag>
              </div>
              <div class="corp-meta">
                <div>{{ corp.memberCount ?? corp.members.length }} 人 · 税率 {{ taxText(corp) }}</div>
                <div v-if="corp.ceoId || corp.creatorId" class="corp-leader">
                  CEO {{ corp.ceoName || corp.ceoId }}<template v-if="corp.creatorId"> · 创建 {{ corp.creatorName || corp.creatorId }}</template>
                </div>
              </div>
              <div v-if="corp.description || corp.url" class="corp-extra">
                <span v-if="corp.description" class="corp-desc" :title="corp.description">{{ corp.description }}</span>
                <a v-if="corp.url" class="corp-site" :href="corp.url" target="_blank" rel="noopener noreferrer" @click.stop>官网 ↗</a>
              </div>
            </div>
            <div class="corp-auth">
              <el-tooltip :content="corp.corpAuthorized ? `已有 ${corp.corpAuthCount} 名军团授权账号在籍，可按军团级数据同步` : '在籍成员中没有军团授权账号，仅公开/成员级同步'" placement="top">
                <el-tag size="small" :type="corp.corpAuthorized ? 'success' : 'warning'" effect="plain">
                  {{ corp.corpAuthorized ? '军团已授权' : '仅公开同步' }}
                </el-tag>
              </el-tooltip>
            </div>
            <div class="corp-actions">
              <el-button size="small" text @click="syncOrg(corp)">同步</el-button>
              <el-button v-if="store.isAdmin" size="small" text type="danger" @click="removeOrg(corp)">移除</el-button>
            </div>
          </div>
        </div>
      </div>
      <el-empty v-if="tree.length === 0" description="暂无数据，点击右上角「同步全部」或「导入演示数据」" />
    </div>

    <!-- 列表视图 -->
    <el-table v-else :data="orgs" style="width: 100%" :class="'dark-table'">
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="row.type === 'alliance' ? 'primary' : 'success'" size="small" effect="dark">
            {{ row.type === 'alliance' ? '联盟' : '军团' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="ticker" label="Ticker" width="100">
        <template #default="{ row }">[{{ row.ticker }}]</template>
      </el-table-column>
      <el-table-column prop="memberCount" label="成员数" width="90" align="right" />
      <el-table-column label="税率" width="90" align="right">
        <template #default="{ row }">{{ taxText(row) }}</template>
      </el-table-column>
      <el-table-column label="成立" width="110" align="center">
        <template #default="{ row }">
          <span v-if="row.dateFounded" style="color: #8aa0c8">{{ row.dateFounded }}</span>
          <span v-else style="color: #5b6780">—</span>
        </template>
      </el-table-column>
      <el-table-column label="CEO / 创建人" min-width="200">
        <template #default="{ row }">
          <span v-if="row.type === 'corporation' && (row.ceoId || row.creatorId)" style="color: #8aa0c8">
            CEO {{ row.ceoName || row.ceoId }}<template v-if="row.creatorId"> · 创建 {{ row.creatorName || row.creatorId }}</template>
          </span>
          <span v-else style="color: #5b6780">—</span>
        </template>
      </el-table-column>
      <el-table-column label="管理" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isManaged ? 'success' : 'info'" size="small" effect="plain">
            {{ row.isManaged ? '已管理' : '未管理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="军团授权" width="110" align="center">
        <template #default="{ row }">
          <span v-if="row.type !== 'corporation'" style="color: #5b6780">—</span>
          <el-tooltip v-else :content="row.corpAuthorized ? `已有 ${row.corpAuthCount} 名军团授权账号在籍，可按军团级数据同步` : '在籍成员中没有军团授权账号，仅公开/成员级同步'" placement="top">
            <el-tag :type="row.corpAuthorized ? 'success' : 'warning'" size="small" effect="plain">
              {{ row.corpAuthorized ? '已就绪' : '未授权' }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="执行军团" width="160" align="center">
        <template #default="{ row }">
          <span v-if="row.type === 'alliance' && row.executorName" style="color: #f5a97f">
            {{ row.executorName }}<template v-if="row.executorTicker"> [{{ row.executorTicker }}]</template>
          </span>
          <el-tag v-else-if="row.type === 'corporation' && row.isExecutor" size="small" type="danger" effect="plain">执行军团</el-tag>
          <span v-else style="color: #5b6780">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="syncOrg(row)">同步</el-button>
          <el-button v-if="store.isAdmin" size="small" text type="danger" @click="removeOrg(row)">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加组织对话框 -->
    <el-dialog v-model="createVisible" title="添加组织" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="alliance">联盟</el-radio>
            <el-radio value="corporation">军团</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="EVE ID">
          <el-input v-model="form.id" placeholder="联盟/军团数字 ID（可在 EVE 官网或个人页查看）" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="组织全称" />
        </el-form-item>
        <el-form-item label="Ticker">
          <el-input v-model="form.ticker" placeholder="如 SWC" />
        </el-form-item>
        <el-form-item v-if="form.type === 'corporation'" label="所属联盟">
          <el-input v-model="form.allianceId" placeholder="联盟 ID（可留空表示独立军团）" />
        </el-form-item>
        <el-form-item label="军税税率">
          <el-input-number v-model="form.taxRate" :min="0" :max="1" :step="0.01" :precision="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createOrg">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orgApi, esiApi } from '../api';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const viewMode = ref<'tree' | 'table'>('tree');
const search = ref('');
const tree = ref<any[]>([]);
const orgs = ref<any[]>([]);
const myOrgs = ref<any[]>([]);
const createVisible = ref(false);
const form = ref({ type: 'corporation', id: '', name: '', ticker: '', allianceId: '', taxRate: 0.1 });

onMounted(loadAll);

async function loadAll() {
  const list = [loadTree(), loadOrgs()];
  if (store.isLoggedIn) list.push(loadMyOrgs());
  await Promise.all(list);
}

async function loadMyOrgs() {
  myOrgs.value = await orgApi.my().catch(() => []);
}

async function loadTree() {
  // 与列表口径保持一致：展示全部组织（含未绑定/未管理、由联盟同步自动登记的军团），
  // 而非仅 isManaged 的组织树
  tree.value = await orgApi.tree(false);
}

async function loadOrgs() {
  orgs.value = await orgApi.list({ search: search.value });
}

async function syncOrg(row: any) {
  const res = await esiApi.syncOrg(row.id);
  const c = res.counts ?? {};
  const parts: string[] = [];
  if (row.type === 'alliance') {
    if (c.corps != null) parts.push(`登记/刷新军团 ${c.corps} 个`);
    if (c.alliance != null) parts.push('执行军团等联盟信息已更新');
  } else {
    if (c.members != null) parts.push(`成员 ${c.members}`);
    if (c.assets != null) parts.push(`资产 ${c.assets}`);
    if (c.taxRecords != null) parts.push(`税单 ${c.taxRecords}`);
    if (c.structures != null) parts.push(`建筑 ${c.structures}`);
    if (c.wallets != null) parts.push(`钱包 ${c.wallets} 部`);
  }
  ElMessage.success(`同步完成：${parts.length ? parts.join('，') : '已是最新'}`);
  loadAll();
}

async function syncAll() {
  ElMessage.info('开始同步全部军团...');
  for (const c of orgs.value.filter((o) => o.type === 'corporation')) {
    await esiApi.syncOrg(c.id);
  }
  ElMessage.success('全部同步完成');
  loadAll();
}

async function removeOrg(row: any) {
  await ElMessageBox.confirm(`确认移除「${row.name}」？`, '提示', { type: 'warning' });
  await orgApi.remove(row.id);
  ElMessage.success('已移除');
  loadAll();
}

/** 税率展示：联盟仅用平台税率；军团优先平台手动税率（已管理且已设置），否则回退 ESI 公开税率 */
function taxPct(node: any): number | null {
  if (node.type === 'alliance') return node.taxRate == null ? null : Math.round(node.taxRate * 10000) / 100;
  const t = node.isManaged && node.taxRate != null ? node.taxRate : node.esiTaxRate;
  return t == null ? null : Math.round(t * 10000) / 100;
}
function taxText(node: any) {
  const p = taxPct(node);
  return p == null ? '—' : `${p}%`;
}

function openCreate() {
  form.value = { type: 'corporation', id: '', name: '', ticker: '', allianceId: '', taxRate: 0.1 };
  createVisible.value = true;
}

async function createOrg() {
  await orgApi.create({
    id: Number(form.value.id),
    type: form.value.type,
    name: form.value.name,
    ticker: form.value.ticker,
    allianceId: form.value.allianceId ? Number(form.value.allianceId) : null,
    taxRate: form.value.taxRate,
    isManaged: true,
  });
  ElMessage.success('组织已添加');
  createVisible.value = false;
  loadAll();
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
  gap: 12px;
}
.tree-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.alliance-card {
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
  overflow: hidden;
}
.alliance-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(79, 124, 255, 0.08);
  border-bottom: 1px solid #1e2942;
}
.org-tag {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.org-tag.alliance {
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
}
.org-tag.corp {
  background: linear-gradient(135deg, #00b4d8, #0096c7);
}
.org-name {
  font-size: 15px;
  font-weight: 600;
  color: #e8ecf8;
}
.org-meta {
  font-size: 12px;
  color: #7d89a8;
  margin-top: 2px;
}
.head-main {
  flex: 1;
  min-width: 0;
}
.head-side {
  display: flex;
  align-items: center;
  gap: 8px;
}
.corp-auth {
  display: flex;
  align-items: center;
  margin-right: 4px;
}
.corp-list {
  padding: 8px 16px;
}
.corp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed #1a2340;
}
.corp-row:last-child {
  border-bottom: none;
}
.corp-info {
  flex: 1;
}
.corp-name {
  font-size: 14px;
  color: #c6cfe8;
}
.corp-meta {
  font-size: 12px;
  color: #5b6780;
  margin-top: 2px;
}
.corp-leader {
  margin-top: 2px;
  color: #4d5a78;
}
.leader-inline {
  color: #6b7fa6;
}
.corp-extra {
  margin-top: 4px;
  font-size: 11px;
  line-height: 16px;
  color: #6d7a94;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.corp-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.corp-site {
  flex-shrink: 0;
  color: #4d8fe6;
  text-decoration: none;
}
.corp-site:hover {
  text-decoration: underline;
}
.ticker {
  color: #5b6780;
  font-size: 12px;
  margin-left: 4px;
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
