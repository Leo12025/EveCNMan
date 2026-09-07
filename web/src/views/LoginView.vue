<template>
  <div class="login-wrap">
    <div class="login-bg"></div>
    <div class="login-card">
      <div class="brand">
        <div class="brand-icon">E</div>
        <h1>eveMan 管理后台</h1>
        <p>EVE 国服 · 多联盟多军团 ESI 管理平台</p>
      </div>

      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'sso' }" type="button" @click="mode = 'sso'">
          EVE 角色登录（SSO）
        </button>
        <button class="mode-tab" :class="{ active: mode === 'password' }" type="button" @click="mode = 'password'">
          平台账号登录
        </button>
      </div>

      <!-- EVE SSO 登录：会话为该角色自身，仅拥有该角色权限 -->
      <template v-if="mode === 'sso'">
        <div class="login-note">
          通过 EVE 授权登录后，你将以<b style="color:#e8a23d">该角色自身身份</b>登录：只拥有这个角色的数据权限；若该角色被平台账号绑定，仍可独立登录。
          首次使用前请先访问 <code>login.evepc.163.com/account/logoff</code> 清理登录缓存，授权窗口才会要求重新登录。
        </div>
        <el-button class="sso-btn" type="primary" size="large" @click="openSsoWindow">
          <span class="btn-icon">◎</span> 使用 EVE 账号登录（SSO · 个人授权）
        </el-button>

        <div v-if="ssoOpened" class="sso-backfill">
          <div class="sso-step">
            <span class="step-num">1</span> 已在新窗口打开 EVE 授权页面（仅申请角色级个人 scope），用网易账号登录并确认授权
          </div>
          <div class="sso-step">
            <span class="step-num">2</span> 授权完成后浏览器停在 <code>oauth2-redirect.html?code=...</code>，<b style="color:#e8a23d">立即</b>复制地址栏完整 URL（授权码有效期很短，请尽快提交）
          </div>
          <div class="sso-step">
            <span class="step-num">3</span> 粘贴到下方输入框，点击「完成 SSO 登录」
          </div>
          <el-input
            v-model="ssoUrl"
            type="textarea"
            :rows="2"
            placeholder="粘贴授权完成后浏览器地址栏的完整 URL..."
            class="sso-input"
          />
          <el-button class="sso-done-btn" type="primary" size="large" :loading="loading" @click="completeSsoLogin">
            完成 SSO 登录
          </el-button>
          <div v-if="!ssoWindowClosed" class="sso-hint">※ 授权窗口未关闭时，可切回该窗口复制 URL</div>
        </div>
      </template>

      <!-- 平台账号登录：拥有名下所有 EVE 角色权限的并集 -->
      <template v-else>
        <div class="login-note">
          平台账号由管理员创建（用户名 + 密码）。登录后你将以<b style="color:#7ee2a8">平台账号</b>身份操作，拥有<b style="color:#e8a23d">名下所有 EVE 角色</b>的权限并集。
        </div>
        <el-input
          v-model="account.username"
          placeholder="平台账号用户名"
          size="large"
          class="field"
          autocomplete="username"
          @keyup.enter="platformLogin"
        />
        <el-input
          v-model="account.password"
          type="password"
          placeholder="密码"
          size="large"
          show-password
          class="field"
          autocomplete="current-password"
          @keyup.enter="platformLogin"
        />
        <el-button class="sso-btn" type="primary" size="large" :loading="loading" @click="platformLogin">
          登录平台账号
        </el-button>
      </template>

      <el-divider>
        <span class="divider-text">或使用演示模式</span>
      </el-divider>

      <el-input v-model="mockName" placeholder="输入昵称（如：演示管理员）" size="large" class="mock-input" />
      <el-button class="mock-btn" size="large" :loading="loading" @click="mockLogin">演示登录</el-button>

      <div class="tip">
        <p>两种登录方式：<b>平台账号</b>（管理员创建，聚合名下多个 EVE 角色权限）与 <b>EVE 角色</b>（SSO 直登，只拥有该角色权限）。</p>
        <p>演示模式：无需真实 SSO 即可体验完整功能，数据为虚构示例。</p>
        <p>军团数据：登录后在「系统设置」对角色发起「军团授权」二次授权（需角色具备相应军团职位）。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authApi } from '../api';
import { useUserStore } from '../stores/user';

const router = useRouter();
const store = useUserStore();
const loading = ref(false);
const mode = ref<'sso' | 'password'>('sso');
const account = reactive({ username: '', password: '' });
const mockName = ref('演示管理员');
const ssoUrl = ref('');
const ssoOpened = ref(false);
let ssoWindow: Window | null = null;
let ssoWindowClosed = ref(false);
let winCheckTimer: number | null = null;

/** 弹窗打开授权页（先同步开窗避免被浏览器拦截） */
async function openSsoWindow() {
  const win = window.open('about:blank', '_blank', 'noopener=no');
  if (!win) {
    ElMessage.warning('弹窗被浏览器拦截，请允许本站弹出新窗口后重试');
    return;
  }
  ssoOpened.value = true;
  ssoWindow = win;
  ssoWindowClosed.value = false;
  try {
    const { url } = await authApi.authorizeUrl({ scope: 'personal' });
    win.location.href = url;
  } catch {
    win.close();
    ElMessage.error('无法生成授权链接');
    return;
  }
  if (winCheckTimer) window.clearInterval(winCheckTimer);
  winCheckTimer = window.setInterval(() => {
    if (ssoWindow?.closed) {
      ssoWindowClosed.value = true;
      if (winCheckTimer) window.clearInterval(winCheckTimer);
    }
  }, 1000);
}

/** 粘贴回调 URL 完成 SSO 登录 */
async function completeSsoLogin() {
  const raw = ssoUrl.value.trim();
  if (!raw) {
    ElMessage.warning('请先粘贴授权完成后浏览器地址栏的完整 URL');
    return;
  }
  loading.value = true;
  try {
    const { token } = await authApi.ssoLogin(raw);
    store.setToken(token);
    await store.fetchMe();
    ElMessage.success('SSO 登录成功');
    router.push('/dashboard');
  } catch (e: any) {
    ElMessage.error(e?.message || 'SSO 登录失败，请确认粘贴的是完整授权回调 URL');
  } finally {
    loading.value = false;
  }
}

/** 平台账号登录 */
async function platformLogin() {
  if (!account.username.trim()) {
    ElMessage.warning('请输入平台账号用户名');
    return;
  }
  if (!account.password) {
    ElMessage.warning('请输入密码');
    return;
  }
  loading.value = true;
  try {
    const { token } = await authApi.login(account.username.trim(), account.password);
    store.setToken(token);
    await store.fetchMe();
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch (e: any) {
    ElMessage.error(e?.message || '登录失败，请检查用户名与密码');
  } finally {
    loading.value = false;
  }
}

async function mockLogin() {
  loading.value = true;
  try {
    const { token } = await authApi.mockLogin(mockName.value);
    store.setToken(token);
    await store.fetchMe();
    ElMessage.success('演示登录成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(79, 124, 255, 0.18), transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(122, 79, 255, 0.18), transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(20, 40, 90, 0.4), transparent 60%),
    #0b1020;
}
.login-card {
  position: relative;
  width: 440px;
  padding: 36px 36px 28px;
  background: rgba(16, 22, 46, 0.85);
  border: 1px solid #243052;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  max-height: 94vh;
  overflow: auto;
}
.brand {
  text-align: center;
  margin-bottom: 22px;
}
.brand-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 700;
  color: #fff;
}
.brand h1 {
  margin: 0;
  font-size: 22px;
  color: #e8ecf8;
}
.brand p {
  margin: 8px 0 0;
  font-size: 13px;
  color: #7d89a8;
}
.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.mode-tab {
  flex: 1;
  height: 36px;
  border: 1px solid #2a3a66;
  border-radius: 8px;
  background: transparent;
  color: #9aa7c6;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-tab:hover {
  background: #16203c;
}
.mode-tab.active {
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}
.sso-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
  border: none;
}
.field {
  margin-bottom: 14px;
}
.login-note {
  font-size: 11px;
  color: #8fa2c8;
  margin-bottom: 10px;
  line-height: 1.7;
  text-align: center;
}
.login-note code {
  background: #16203c;
  padding: 1px 5px;
  border-radius: 4px;
  color: #8fa8ff;
  word-break: break-all;
}
.btn-icon {
  margin-right: 6px;
}
.sso-backfill {
  margin-top: 16px;
  padding: 14px;
  background: #131b33;
  border: 1px solid #2a3a66;
  border-radius: 10px;
}
.sso-step {
  font-size: 12px;
  color: #9aa7c6;
  line-height: 1.7;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.step-num {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f7cff, #7a4fff);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sso-step code {
  background: #16203c;
  padding: 1px 5px;
  border-radius: 4px;
  color: #8fa8ff;
  word-break: break-all;
}
.sso-input {
  margin-top: 12px;
}
.sso-done-btn {
  width: 100%;
  margin-top: 10px;
}
.sso-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #5b6780;
}
.divider-text {
  font-size: 12px;
  color: #5b6780;
}
.mock-input {
  margin-bottom: 12px;
}
.mock-btn {
  width: 100%;
  border-color: #3a4a73;
  color: #c6cfe8;
  background: transparent;
}
.mock-btn:hover {
  background: #16203c;
}
.tip {
  margin-top: 20px;
  font-size: 12px;
  color: #5b6780;
  line-height: 1.8;
}
.tip code {
  background: #16203c;
  padding: 2px 6px;
  border-radius: 4px;
  color: #8fa8ff;
}
</style>
