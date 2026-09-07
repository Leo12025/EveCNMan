import client from './client';

export const authApi = {
  me: () => client.get('/auth/me'),
  /** 平台账号登录（用户名 + 密码） */
  login: (username: string, password: string) => client.post('/auth/login', { username, password }),
  /** scope: personal 个人授权（默认）/ corp 军团授权 */
  authorizeUrl: (opts?: { scope?: 'personal' | 'corp'; state?: string }) =>
    client.get('/auth/authorize-url', {
      params: { scope: opts?.scope || 'personal', ...(opts?.state ? { state: opts.state } : {}) },
    }),
  mockLogin: (username: string) => client.post('/auth/mock-login', { username }),
  ssoLogin: (url: string) => client.post('/auth/sso-login', { url }),
  bindCode: (url: string) => client.post('/auth/bind-code', { url }),
  unbind: (id: number) => client.delete(`/auth/accounts/${id}`),
  refresh: (id: number) => client.post(`/auth/accounts/${id}/refresh`),
  accounts: () => client.get('/auth/accounts'),
};

export const userApi = {
  list: () => client.get('/users'),
  create: (data: { username: string; password: string; role?: string }) => client.post('/users', data),
  resetPassword: (id: number, password: string) => client.put(`/users/${id}/password`, { password }),
  setRole: (id: number, role: string) => client.put(`/users/${id}/role`, { role }),
  remove: (id: number) => client.delete(`/users/${id}`),
};

export const structureApi = {
  list: (params?: any) => client.get('/structures', { params }),
  stats: (corporationId?: number) => client.get('/structures/stats', { params: corporationId ? { corporationId } : undefined }),
  updateNote: (id: string, note: string) => client.post(`/structures/${id}/note`, { note }),
};

export const configApi = {
  get: () => client.get('/config'),
};

export const orgApi = {
  list: (params: any = {}) => client.get('/orgs', { params }),
  tree: (managedOnly = true) => client.get('/orgs/tree', { params: { managedOnly } }),
  detail: (id: number) => client.get(`/orgs/${id}`),
  create: (data: any) => client.post('/orgs', data),
  update: (id: number, patch: any) => client.patch(`/orgs/${id}`, patch),
  remove: (id: number) => client.delete(`/orgs/${id}`),
  my: () => client.get('/orgs/my'),
};

export const memberApi = {
  list: (params: any = {}) => client.get('/members', { params }),
  stats: () => client.get('/members/stats'),
  detail: (characterId: number) => client.get(`/members/${characterId}`),
  update: (characterId: number, patch: any) => client.patch(`/members/${characterId}`, patch),
  tiers: (orgId?: number) => client.get('/members/tiers', { params: orgId ? { orgId } : undefined }),
  recomputeTiers: (orgId?: number) => client.post('/members/recompute-tiers', undefined, { params: orgId ? { orgId } : undefined }),
};

export const recruitApi = {
  list: (params: any = {}) => client.get('/recruits', { params }),
  submit: (data: any) => client.post('/recruits', data),
  gate: (orgId: number, orgType = 'corporation') => client.get('/recruits/gate', { params: { orgId, orgType } }),
  upsertGate: (data: any) => client.post('/recruits/gate', data),
  review: (id: number, approve: boolean, note?: string) => client.post(`/recruits/${id}/review`, { approve, note }),
  join: (id: number, characterId: number) => client.post(`/recruits/${id}/join`, { characterId }),
  leave: (characterId: number, orgId: number, reason?: string) => client.post('/recruits/leave', { characterId, orgId, reason }),
};

export const structureAlertApi = {
  list: (params: any = {}) => client.get('/structure-alerts', { params }),
  generate: (corporationId: number) => client.post('/structure-alerts/generate', undefined, { params: { corporationId } }),
  resolve: (id: number) => client.post(`/structure-alerts/${id}/resolve`),
};

export const assetApi = {
  list: (params: any = {}) => client.get('/assets', { params }),
  summary: (params: any = {}) => client.get('/assets/summary', { params }),
  blueprints: (params: any = {}) => client.get('/assets/blueprints', { params }),
  logs: (params: any = {}) => client.get('/assets/logs', { params }),
  logTake: (data: any) => client.post('/assets/logs', data),
  needs: (orgId: number) => client.get('/assets/needs', { params: { orgId } }),
  upsertNeed: (data: any) => client.post('/assets/needs', data),
  removeNeed: (id: number) => client.delete(`/assets/needs/${id}`),
  gaps: (orgId: number) => client.get('/assets/gaps', { params: { orgId } }),
};

export const financeApi = {
  apply: (data: any) => client.post('/finance/expenses', data),
  listExpenses: (params: any = {}) => client.get('/finance/expenses', { params }),
  reviewExpense: (id: number, approve: boolean, note?: string) => client.post(`/finance/expenses/${id}/review`, { approve, note }),
  payoutExpense: (id: number, ref?: string) => client.post(`/finance/expenses/${id}/payout`, { ref }),
  computePayout: (data: any) => client.post('/finance/payouts/compute', data),
  listPayouts: (orgId: number) => client.get('/finance/payouts', { params: { orgId } }),
  finalizePayout: (id: number, status: string, note?: string) => client.post(`/finance/payouts/${id}/finalize`, { status, note }),
};

export const marketApi = {
  listOrders: (params: any = {}) => client.get('/market/orders', { params }),
  createOrder: (data: any) => client.post('/market/orders', data),
  cancelOrder: (id: number) => client.post(`/market/orders/${id}/cancel`),
  watches: (typeId?: number) => client.get('/market/watches', { params: typeId ? { typeId } : undefined }),
  watch: (data: any) => client.post('/market/watches', data),
  compare: (typeId: number, regions: number[]) => client.get('/market/compare', { params: { typeId, regions: regions.join(',') } }),
  history: (params: { regionId: number; typeId: number; typeName?: string; days?: number }) =>
    client.get('/market/history', { params }),
};

export const industryApi = {
  listJobs: (params: any = {}) => client.get('/industry/jobs', { params }),
  createJob: (data: any) => client.post('/industry/jobs', data),
  updateJob: (id: number, data: any) => client.post(`/industry/jobs/${id}`, data),
  costs: (orgId: number) => client.get('/industry/costs', { params: { orgId } }),
  ledgers: (params: any = {}) => client.get('/industry/ledgers', { params }),
  upsertLedger: (data: any) => client.post('/industry/ledgers', data),
  miningReport: (orgId: number, period: string) => client.get('/industry/mining-report', { params: { orgId, period } }),
};

export const srpApi = {
  rules: (orgId: number) => client.get('/srp/rules', { params: { orgId } }),
  upsertRule: (data: any) => client.post('/srp/rules', data),
  removeRule: (id: number) => client.delete(`/srp/rules/${id}`),
  import: (data: any) => client.post('/srp/import', data),
  claims: (params: any = {}) => client.get('/srp/claims', { params }),
  review: (id: number, approve: boolean, reason?: string) => client.post(`/srp/claims/${id}/review`, { approve, reason }),
  paid: (id: number, ref?: string) => client.post(`/srp/claims/${id}/paid`, { ref }),
  monthly: (orgId: number) => client.get('/srp/monthly', { params: { orgId } }),
};

export const fleetApi = {
  list: (params: any = {}) => client.get('/fleets', { params }),
  create: (data: any) => client.post('/fleets', data),
  detail: (id: number) => client.get(`/fleets/${id}`),
  update: (id: number, data: any) => client.post(`/fleets/${id}`, data),
  ping: (id: number, channels: string) => client.post(`/fleets/${id}/ping`, { channels }),
  signup: (data: any) => client.post('/fleets/signups', data),
  attendance: (id: number, attended: boolean) => client.post(`/fleets/signups/${id}/attendance`, { attended }),
  participation: (orgId: number) => client.get('/fleets/stats/participation', { params: { orgId } }),
};

export const diplomacyApi = {
  list: (orgId: number) => client.get('/diplomacy', { params: { orgId } }),
  relation: (orgId: number, relation: string) => client.get(`/diplomacy/relation/${relation}`, { params: { orgId } }),
  upsert: (data: any) => client.post('/diplomacy', data),
  remove: (id: number) => client.delete(`/diplomacy/${id}`),
  transfers: (status?: string) => client.get('/diplomacy/transfers', { params: status ? { status } : undefined }),
  createTransfer: (data: any) => client.post('/diplomacy/transfers', data),
  reviewTransfer: (id: number, approve: boolean, note?: string) => client.post(`/diplomacy/transfers/${id}/review`, { approve, note }),
  completeTransfer: (id: number) => client.post(`/diplomacy/transfers/${id}/complete`),
};

export const notifyApi = {
  list: (page = 1) => client.get('/notify', { params: { page } }),
  markRead: (id: number) => client.post(`/notify/${id}/read`),
  configs: () => client.get('/notify/configs'),
  upsertConfig: (data: any) => client.post('/notify/configs', data),
  removeConfig: (id: number) => client.delete(`/notify/configs/${id}`),
};

export const systemApi = {
  backup: () => client.post('/system/backup'),
  backups: () => client.get('/system/backups'),
  encryptLegacyTokens: () => client.post('/system/encrypt-legacy-tokens'),
};

export const taxApi = {
  list: (params: any = {}) => client.get('/taxes', { params }),
  monthlySummary: (params: any = {}) => client.get('/taxes/monthly-summary', { params }),
  ranking: (limit = 20) => client.get('/taxes/ranking', { params: { limit } }),
  trend: (months = 6) => client.get('/taxes/trend', { params: { months } }),
  import: (data: any) => client.post('/taxes/import', data),
};

export const dashboardApi = {
  overview: () => client.get('/dashboard/overview'),
  charts: () => client.get('/dashboard/charts'),
  rankings: () => client.get('/dashboard/rankings'),
  export: (type: string, orgId?: number) => client.get('/dashboard/export', { params: { type, orgId }, responseType: 'blob' }),
};

export const esiApi = {
  syncOrg: (id: number) => client.post(`/esi/orgs/${id}/sync`),
  syncAlliance: (id: number) => client.post(`/esi/orgs/${id}/sync-alliance`),
  syncCharacter: (id: number) => client.post(`/esi/characters/${id}/sync`),
  characterData: (id: number) => client.get(`/esi/characters/${id}/data`),
  characterProfile: (id: number) => client.get(`/esi/characters/${id}/profile`),
  seedDemo: () => client.post('/esi/seed-demo'),
  clearDemo: () => client.post('/esi/clear-demo'),
  status: () => client.get('/esi/status'),
  logs: () => client.get('/esi/logs'),
};

export const walletApi = {
  settle: (orgId?: number) => client.get('/wallets/settle', { params: { orgId } }),
  journals: (params: any = {}) => client.get('/wallets/journals', { params }),
  refTypes: () => client.get('/wallets/ref-types'),
};
