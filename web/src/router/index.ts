import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/callback', name: 'callback', component: () => import('../views/CallbackView.vue') },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '总览' } },
      { path: 'orgs', name: 'orgs', component: () => import('../views/OrgsView.vue'), meta: { title: '组织架构' } },
      { path: 'members', name: 'members', component: () => import('../views/MembersView.vue'), meta: { title: '成员管理' } },
      { path: 'recruits', name: 'recruits', component: () => import('../views/RecruitsView.vue'), meta: { title: '入团审核' } },
      { path: 'assets', name: 'assets', component: () => import('../views/AssetsView.vue'), meta: { title: '资产管理' } },
      { path: 'blueprints', name: 'blueprints', component: () => import('../views/BlueprintsView.vue'), meta: { title: '蓝图库' } },
      { path: 'asset-logs', name: 'asset-logs', component: () => import('../views/AssetLogsView.vue'), meta: { title: '资产流水' } },
      { path: 'structures', name: 'structures', component: () => import('../views/StructuresView.vue'), meta: { title: '建筑管理' } },
      { path: 'structure-alerts', name: 'structure-alerts', component: () => import('../views/StructureAlertsView.vue'), meta: { title: '结构预警' } },
      { path: 'wallets', name: 'wallets', component: () => import('../views/WalletJournalView.vue'), meta: { title: '钱包流水' } },
      { path: 'taxes', name: 'taxes', component: () => import('../views/TaxesView.vue'), meta: { title: '军税财务' } },
      { path: 'finance', name: 'finance', component: () => import('../views/FinanceView.vue'), meta: { title: '财务审批' } },
      { path: 'market', name: 'market', component: () => import('../views/MarketView.vue'), meta: { title: '市场挂单' } },
      { path: 'industry', name: 'industry', component: () => import('../views/IndustryView.vue'), meta: { title: '制造工业' } },
      { path: 'srp', name: 'srp', component: () => import('../views/SrpView.vue'), meta: { title: 'SRP 报销' } },
      { path: 'fleets', name: 'fleets', component: () => import('../views/FleetsView.vue'), meta: { title: '舰队作战' } },
      { path: 'diplomacy', name: 'diplomacy', component: () => import('../views/DiplomacyView.vue'), meta: { title: '外交关系' } },
      { path: 'notify', name: 'notify', component: () => import('../views/NotifyView.vue'), meta: { title: '通知中心' } },
      { path: 'characters/:id', name: 'character-detail', component: () => import('../views/CharacterDetailView.vue'), meta: { title: '角色详情' } },
      { path: 'users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { title: '用户管理' } },
      { path: 'system', name: 'system', component: () => import('../views/SystemView.vue'), meta: { title: '安全与备份' } },
      { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '系统设置' } },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const store = useUserStore();
  const token = store.token || localStorage.getItem('eveman_token');
  const publicRoute = to.name === 'login' || to.name === 'callback';

  if (!token) return publicRoute ? true : { name: 'login' };
  if (publicRoute) return { name: 'dashboard' };

  // 进入受保护页面前先拉取当前用户，避免刷新后视图先渲染出「无权限/只读」的假状态
  if (!store.user) {
    try {
      await store.fetchMe();
    } catch {
      store.logout();
      return { name: 'login' };
    }
  }
  return true;
});

export default router;
