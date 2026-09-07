import { defineStore } from 'pinia';
import { authApi } from '../api';

export type UserKind = 'platform' | 'eve';

interface UserInfo {
  id: number;
  username: string;
  /** 身份主体类型：platform=平台账号（密码登录，名下多角色并集）；eve=EVE 角色身份 */
  kind?: UserKind;
  role: string;
  isActive?: boolean;
  eveAccounts?: any[];
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('eveman_token') || '',
    user: null as UserInfo | null,
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    isAdmin: (s) => ['admin', 'super_admin'].includes(s.user?.role || ''),
    isOfficer: (s) => ['admin', 'super_admin', 'officer'].includes(s.user?.role || ''),
  },
  actions: {
    setToken(token: string) {
      this.token = token;
      localStorage.setItem('eveman_token', token);
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('eveman_token');
    },
    async fetchMe() {
      this.user = await authApi.me();
      return this.user;
    },
  },
});
