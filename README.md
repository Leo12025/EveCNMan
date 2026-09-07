# eveMan · EVE 国服多联盟多军团 ESI 管理后台

面向 EVE Online 国服（网易代理）的联盟/军团管理平台，支持 **多联盟、多军团混合管理**，对接国服 ESI（数据接口已迁移至 `ali-esi.evepc.163.com`）。

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Vite + Pinia + Vue Router + Element Plus + ECharts |
| 后端 | NestJS 10 + TypeORM + Passport(JWT) + Axios |
| 数据库 | SQLite（`better-sqlite3`，开箱即用；可切换 PostgreSQL） |

## 目录结构

```
eveMan/
├── server/            # NestJS 后端
│   ├── src/
│   │   ├── common/    # 实体、守卫、装饰器
│   │   ├── auth/      # EVE SSO + JWT 认证
│   │   ├── orgs/      # 多联盟/军团组织架构
│   │   ├── members/   # 成员管理
│   │   ├── esi/       # ESI 同步引擎（真实 + Mock 双通道）
│   │   ├── assets/    # 资产管理
│   │   ├── taxes/     # 军税财务
│   │   └── dashboard/ # 总览/图表/排行
│   └── .env.example   # 环境变量模板
└── web/               # Vue3 前端
    └── src/
        ├── views/     # 页面（登录/总览/组织/成员/资产/税收/设置）
        ├── layouts/   # 主布局
        ├── api/       # 接口封装
        └── stores/    # Pinia 状态
```

## 快速启动

### 1. 后端（端口 3000）

```bash
cd server
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run start:dev
```

### 2. 前端（端口 5173）

```bash
cd web
npm install
npm run dev
```

打开 <http://localhost:5173>

## 演示模式（无需 SSO）

未配置 `EVE_SSO_CLIENT_ID` 时后端处于**演示模式**：

1. 登录页点击 **演示登录** 进入后台；
2. 进入 **系统设置 → 导入演示数据**，生成 2 个联盟 + 4 个军团 + 286 名成员的完整演示数据（含资产、税收）。

## 接入真实国服 SSO / ESI

国服 ESI 已迁移到 `ali-esi.evepc.163.com`，SSO 授权走 `login.evepc.163.com/v2/oauth/authorize`（需 `realm=ESI` + `device_id`），SSO 实测支持一次性携带大量 scope，token 交换仅需 `client_id`。

> 网易官方**未开放** client_id 申请渠道，第三方工具/KB网均直接复用官方 ESI 网页自带的 client_id（`bc90aa496a404724a93f41b4f4e97761`），本项目默认内置该 ID，**开箱即用，无需任何申请**。`realm`、`device_id` 官方不校验，任意值即可。

1. 默认无需配置；若后续获得专属客户端，编辑 `server/.env`：

```env
EVE_SSO_CLIENT_ID=你的ClientID
EVE_SSO_CLIENT_SECRET=你的Secret（国服通常可留空）
EVE_DEVICE_ID=对应device_id
EVE_ESI_BASE_URL=https://ali-esi.evepc.163.com
EVE_SSO_REDIRECT_URI=https://ali-esi.evepc.163.com/ui/oauth2-redirect.html
EVE_SCOPES=esi-wallet.read_character_wallet.v1 esi-corporations.read_corporation_membership.v1 esi-wallet.read_corporation_wallets.v1 esi-assets.read_corporation_assets.v1
ALLOW_MOCK_LOGIN=false
JWT_SECRET=换成随机长字符串
```

2. 重启后端；
3. **绑定角色**（国服回调为官方固定页面，需手动回填）：
   - 「系统设置 → 打开 SSO 授权页面」→ 网易账号登录并授权；
   - 浏览器停在 `ali-esi.evepc.163.com/ui/oauth2-redirect.html?code=...&state=...`；
   - 复制地址栏完整 URL 粘贴回「绑定角色」输入框，即可完成绑定。

> 复用的是官方 ESI 网页自身的 client_id（网易官方未开放申请渠道），与各第三方工具站同源共用，token 只在本系统内使用、不会泄露给第三方。

> 军团级数据（成员/资产/钱包/军税）需要该军团具备 CEO/Director 角色的成员完成 SSO 授权（对应 scope）。授权 scope 组合见 `server/src/esi/esi.sync.service.ts` 的 `ESI_SCOPES`。

## 安全合规

### Token AES 加密存储

ESI OAuth token（`access_token` / `refresh_token`）**不落明文**：

- 写入时由 `CryptoService` 以 **AES-256-GCM** 加密（随机 12 字节 IV + GCM 认证 tag，防篡改）；
- `EveAccount` 实体通过 `BeforeInsert / BeforeUpdate` 钩子自动加密、`AfterLoad` 自动解密，业务代码无感知；
- 历史明文 token 提供一键迁移：**系统设置 → 数据备份 → 迁移加密历史 Token**（接口 `POST /system/encrypt-legacy-tokens`），迁移后 `tokenEncrypted` 标记置位。

生产环境务必配置加密密钥（`server/.env`）：

```env
# 32 字节 base64，可用 openssl rand -base64 32 生成
TOKEN_ENC_KEY=
# 未配置 TOKEN_ENC_KEY 时回退到 APP_SECRET 派生密钥
APP_SECRET=
```

> 密钥一旦变更，历史密文将无法解密（需重新绑定角色），请妥善保管、勿写入代码仓库。

### 敏感操作二次确认

删除用户/组织、解绑角色、踢出成员、打款（SRP/支出/分红发放）、撤销市场挂单、集结 Ping、删除报销规则/外交关系/Webhook、清空演示数据、Token 迁移等敏感操作均需弹窗二次确认，防止误触。

### 数据备份

- 手动备份：**系统设置 → 数据备份 → 立即备份**，生成 gzip 压缩备份文件（接口 `POST /system/backup`）；
- 备份列表：支持查看历史备份与恢复（`GET /system/backups`）；
- 备份文件存放于 `server/backups/` 目录。

## 已实现的完整 ESI 能力

**SSO 认证**：授权码模式、refresh_token 自动刷新（定时任务）、scope 自适应同步、角色绑定/解绑

**角色数据**（按 scope 授权自动同步）：技能、技能队列、钱包余额/流水、资产、蓝图、位置、在线状态、舰船、克隆、忠诚点、军团职位、工业任务

**军团数据**：成员列表、成员追踪（登录时间/位置）、钱包（1~7 分部）与钱包日志、资产、蓝图、结构、分部、工业任务；钱包日志中 `player_tax` 自动聚合为军税报表

**联盟数据**：联盟军团列表自动注册、公开信息

**宇宙/市场**：名称批量解析、物品/星系/建筑、市场均价缓存（资产估值）、服务器状态

## 已实现功能

- ✅ EVE 国服 SSO 登录 + JWT + 分级权限（super_admin/admin/member/viewer）
- ✅ 多联盟、多军团混编：联盟下辖军团、独立军团、跨组织成员
- ✅ ESI 同步引擎：角色/军团数据管线，真实 ESI 与 Mock 演示双通道
- ✅ 组织架构树（联盟 → 军团 → 成员）与组织 CRUD
- ✅ 成员管理：SP/安全等级/军团职位/最近登录/军税贡献，搜索排序分页
- ✅ 资产管理：总值/位置分布/物品 Top/蓝图标记/明细分页
- ✅ 军税财务：月度汇总、税单明细、成员排行、税收趋势、手动录入
- ✅ 仪表盘：核心指标、税收趋势图、SP 分布饼图、贡献/SP 排行榜
- ✅ 同步日志、演示数据一键导入
- ✅ 安全合规：ESI token AES-256-GCM 加密落库、敏感操作二次确认、数据库手动备份/恢复

## 后续可扩展

SRP 报销、市场挂单、制造工业、结构监控、舰队集结、招新审核、外交管理、zKillboard 集成、QQ/微信机器人通知等（见功能清单规划）。
