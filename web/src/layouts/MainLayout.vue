<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">E</div>
        <div>
          <div class="logo-title">eveMan 管理后台</div>
          <div class="logo-sub">多联盟 · 多军团</div>
        </div>
      </div>
      <nav class="nav">
        <router-link v-for="item in menus" :key="item.path" :to="item.path" class="nav-item">
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.title }}</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">ESI · 国服</div>
    </aside>

    <div class="main">
      <header class="header">
        <div class="header-title">{{ route.meta.title || 'eveMan' }}</div>
        <div class="header-right">
          <el-tag v-if="!isAdmin" size="small" type="info">只读</el-tag>
          <el-tag v-else size="small" type="success">{{ roleLabel }}</el-tag>
          <el-tag v-if="store.user?.kind === 'platform'" size="small" type="warning" effect="plain">平台账号</el-tag>
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="28" class="avatar">{{ initial }}</el-avatar>
              <span>{{ displayName }}</span>
              <el-icon><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const store = useUserStore();

const allMenus = [
  { path: '/dashboard', title: '总览', icon: '◈', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/orgs', title: '组织架构', icon: '⌘', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/members', title: '成员管理', icon: '☰', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/recruits', title: '入团审核', icon: '✉', roles: ['super_admin', 'admin'] },
  { path: '/assets', title: '资产管理', icon: '▦', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/blueprints', title: '蓝图库', icon: '✦', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/asset-logs', title: '资产流水', icon: '⇄', roles: ['super_admin', 'admin', 'officer'] },
  { path: '/structures', title: '建筑管理', icon: '⬢', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/structure-alerts', title: '结构预警', icon: '⚠', roles: ['super_admin', 'admin', 'officer'] },
  { path: '/wallets', title: '钱包流水', icon: '◧', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/taxes', title: '军税财务', icon: '₡', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/finance', title: '支出审批', icon: '≋', roles: ['super_admin', 'admin', 'officer', 'member'] },
  { path: '/market', title: '市场挂单', icon: '⇅', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/industry', title: '制造工业', icon: '⚒', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/srp', title: 'SRP 报销', icon: '✚', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/fleets', title: '舰队作战', icon: '⌖', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/diplomacy', title: '外交关系', icon: '⌗', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/notify', title: '通知中心', icon: '☎', roles: ['super_admin', 'admin', 'member', 'viewer'] },
  { path: '/users', title: '用户管理', icon: '⌾', roles: ['super_admin', 'admin'] },
  { path: '/system', title: '安全与备份', icon: '⚿', roles: ['super_admin', 'admin'] },
  { path: '/settings', title: '系统设置', icon: '⚙', roles: ['super_admin', 'admin', 'member', 'viewer'] },
];
const menus = computed(() => {
  const role = store.user?.role || '';
  return allMenus.filter((m) => m.roles.includes(role));
});

const displayName = computed(() => {
  const name = store.user?.username || '';
  return name.replace(/^eve:/, '');
});
const initial = computed(() => displayName.value.slice(0, 1).toUpperCase() || 'U');
const roleLabel = computed(() => (store.user?.role === 'super_admin' ? '超管' : '管理员'));
const isAdmin = computed(() => store.isAdmin);

onMounted(async () => {
  if (store.isLoggedIn && !store.user) {
    try {
      await store.fetchMe();
    } catch {
      store.logout();
    }
  }
});

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    store.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}
.sidebar {
  width: 220px;
  background: #0d1226;
  border-right: 1px solid #1e2942;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid #1e2942;
}
.logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}
.logo-title {
  font-size: 14px;
  font-weight: 600;
  color: #e8ecf8;
}
.logo-sub {
  font-size: 11px;
  color: #5b6780;
}
.nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  color: #9aa5c1;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}
.nav-item:hover {
  background: #16203c;
  color: #dbe3ff;
}
.nav-item.router-link-active {
  background: linear-gradient(90deg, rgba(79, 124, 255, 0.25), rgba(122, 79, 255, 0.15));
  color: #fff;
  font-weight: 600;
}
.nav-icon {
  width: 20px;
  text-align: center;
}
.sidebar-footer {
  padding: 14px 16px;
  font-size: 11px;
  color: #4a5670;
  border-top: 1px solid #1e2942;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #1e2942;
  background: rgba(13, 18, 38, 0.8);
  backdrop-filter: blur(8px);
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #e8ecf8;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #c6cfe8;
  font-size: 13px;
}
.avatar {
  background: #4f7cff;
  color: #fff;
  font-weight: 600;
}
.content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}
</style>
