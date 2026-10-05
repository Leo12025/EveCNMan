/**
 * 演示数据生成器。
 * 当未配置真实 ESI Client 时，同步引擎会调用这些数据源，
 * 方便本地跑通 UI 全流程。数据为虚构，仅用于展示。
 */

export interface MockMember {
  characterId: number;
  characterName: string;
  sp: number;
  securityStatus: number;
  lastLogin: Date;
  monthlyTax: number;
  roles: string[];
}

const CORPS = [
  { id: 98123456, name: '星域重工集团', ticker: 'SWC', taxRate: 0.1, allianceId: 99000123, allianceName: '北境曙光联盟', roles: ['Director', 'Accountant', 'Member'] },
  { id: 98123457, name: '晨曦远征军', ticker: 'CX', taxRate: 0.15, allianceId: 99000123, allianceName: '北境曙光联盟', roles: ['CEO', 'Director', 'Member'] },
  { id: 98123458, name: '深空矿业联合体', ticker: 'DMU', taxRate: 0.05, allianceId: 99000124, allianceName: '星海自由邦', roles: ['Member'] },
  { id: 98123459, name: '铁壁保安服务', ticker: 'IBS', taxRate: 0.08, allianceId: null, allianceName: null, roles: ['Director', 'Member'] },
];

const ALLIANCES = [
  { id: 99000123, name: '北境曙光联盟', ticker: 'NOD', taxRate: 0.05, executorCorpId: 98123456, dateFounded: '2021-06-15' },
  { id: 99000124, name: '星海自由邦', ticker: 'SFC', taxRate: 0.03, executorCorpId: 98123458, dateFounded: '2019-03-02' },
];

const GIVEN_NAMES = ['阿尔法', '贝塔', '伽马', '德尔塔', '艾普西龙', '泽塔', '伊塔', '西塔', '约塔', '卡帕', '兰布达', '缪'];
const SURNAMES = ['先驱', '守望者', '游骑兵', '铸造师', '猎手', '学者', '矿工', '船长', '工程师', '外交官', '战术家', '后勤官'];

function seededName(seed: number): string {
  const n = seed % (GIVEN_NAMES.length * SURNAMES.length);
  const g = n % GIVEN_NAMES.length;
  const s = Math.floor(n / GIVEN_NAMES.length) % SURNAMES.length;
  return `${GIVEN_NAMES[g]}·${SURNAMES[s]}`;
}

/** 按军团生成成员列表（确定性伪随机） */
export function mockCorporationMembers(corpId: number): MockMember[] {
  const seedBase = corpId % 997;
  const count = 20 + (seedBase % 60); // 20~80 人
  const members: MockMember[] = [];
  const corp = CORPS.find((c) => c.id === corpId);
  for (let i = 0; i < count; i++) {
    const characterId = 2100000000 + seedBase * 1000 + i * 17;
    const now = Date.now();
    members.push({
      characterId,
      characterName: seededName(seedBase + i * 3),
      sp: Math.round((5 + Math.random() * 55) * 10000) * 100, // 500万~6000万 SP
      securityStatus: Math.round((Math.random() * 9 - 2) * 100) / 100,
      lastLogin: new Date(now - Math.floor(Math.random() * 30) * 86400000),
      monthlyTax: Math.round(Math.random() * 200_000_000),
      roles: corp?.roles || ['Member'],
    });
  }
  return members;
}

/** 按军团生成资产（类型采样） */
export function mockCorporationAssets(corpId: number): Array<{ itemId: number; typeId: number; typeName: string; quantity: number; locationId: number; locationName: string; isBlueprint: boolean; isSingleton: boolean; estimatedValue: number }> {
  const samples = [
    { typeId: 44997, name: 'PLEX（国服）', bp: false },
    { typeId: 28606, name: '猛鲑级', bp: false },
    { typeId: 28352, name: '米玛塔尔金牛座战列舰蓝图', bp: true },
    { typeId: 17736, name: 'L 型装甲维修无人机', bp: false },
    { typeId: 12198, name: '帝国号推进器', bp: false },
    { typeId: 3468, name: '三钛合金', bp: false },
    { typeId: 38, name: '舰载计算机 I', bp: false },
    { typeId: 4247, name: '星域精炼工厂蓝', bp: true },
  ];
  const locations = ['空间站 · 四战之地', 'Fortizar · 晨曦要塞', '工程复合体 · 深空铸造', '空间站 · 新伊甸之门'];
  const assets = [];
  let idx = 0;
  for (const s of samples) {
    const batch = 3 + ((corpId + idx) % 8);
    for (let k = 0; k < batch; k++) {
      const loc = locations[(idx + k) % locations.length];
      assets.push({
        itemId: corpId * 100000 + idx * 1000 + k,
        typeId: s.typeId,
        typeName: s.name,
        quantity: s.bp ? 1 : 10 + ((idx + k) % 90) * 10,
        locationId: 1024856332000 + (idx + k),
        locationName: loc,
        isBlueprint: s.bp,
        isSingleton: !s.bp,
        estimatedValue: s.bp ? 150000000 + idx * 4000000 : (idx + 1) * 2_500_000,
      });
    }
    idx++;
  }
  return assets;
}

/** 按组织生成月度军税汇总（近 6 个月） */
export function mockTaxRecords(orgId: number, orgName: string): Array<{ characterId: number; characterName: string; year: number; month: number; amount: number }> {
  const members = mockCorporationMembers(orgId);
  const now = new Date();
  const records = [];
  for (const m of members.slice(0, 12)) {
    for (let back = 0; back < 6; back++) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      records.push({
        characterId: m.characterId,
        characterName: m.characterName,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        amount: m.monthlyTax * (1 - back * 0.08),
      });
    }
  }
  return records;
}

const STRUCTURE_TYPE_POOL = [
  { id: 35834, name: '避风港级星城（Keepstar）' },
  { id: 35833, name: '福尔蒂扎级星城（Fortizar）' },
  { id: 35832, name: '阿斯特拉豪斯级星城（Astrahus）' },
  { id: 35841, name: '索提约级工程复合体（Sotiyo）' },
  { id: 35836, name: '阿兹贝尔级工程复合体（Azbel）' },
  { id: 35835, name: '拉伊塔鲁级工程复合体（Raitaru）' },
  { id: 35827, name: '塔塔拉级精炼厂（Tatara）' },
  { id: 35826, name: '阿泽诺级精炼厂（Athanor）' },
];

const STRUCTURE_SYSTEM_POOL = [
  { id: 30005042, name: '欧顿星系', constellationId: 20000452, regionId: 10000037, regionName: '北境星域' },
  { id: 30005043, name: '佛伦星系', constellationId: 20000453, regionId: 10000037, regionName: '北境星域' },
  { id: 30005044, name: '新加迭里星系', constellationId: 20000454, regionId: 10000037, regionName: '北境星域' },
  { id: 30005045, name: '维拉塞尔星系', constellationId: 20000455, regionId: 10000037, regionName: '北境星域' },
  { id: 30005046, name: '希德利星系', constellationId: 20000456, regionId: 10000037, regionName: '北境星域' },
  { id: 30005047, name: '米彻尔星系', constellationId: 20000457, regionId: 10000037, regionName: '北境星域' },
  { id: 30004996, name: '奥伊尔星系', constellationId: 20000458, regionId: 10000037, regionName: '北境星域' },
  { id: 30004997, name: '迪奥维星系', constellationId: 20000459, regionId: 10000037, regionName: '北境星域' },
];

/** 军团建筑（Upwell 结构等），结构与 ESI /corporations/{id}/structures/ 返回字段对齐 */
export function mockCorporationStructures(corpId: number): Array<Record<string, unknown>> {
  const states = ['online', 'shield_vulnerable', 'anchor_vulnerable', 'armor_vulnerable', 'online', 'anchoring'];
  const seed = corpId % 997;
  const count = 3 + (seed % 5); // 3~7 个建筑
  const list = [];
  for (let i = 0; i < count; i++) {
    const t = STRUCTURE_TYPE_POOL[(seed + i * 2) % STRUCTURE_TYPE_POOL.length];
    const s = STRUCTURE_SYSTEM_POOL[(seed + i * 3) % STRUCTURE_SYSTEM_POOL.length];
    const state = states[(seed + i) % states.length];
    const vulnerable = state !== 'online' && state !== 'anchoring' && state !== 'unanchoring';
    list.push({
      structure_id: 1_020_000_000_000 + seed * 100_000 + i * 1000,
      type_id: t.id,
      system_id: s.id,
      profile_id: null,
      state,
      fuel_expires_hours: state === 'online' ? 24 + ((seed + i * 7) % 480) : null,
      next_vulnerable_window_start: vulnerable ? new Date(Date.now() + (86400000 + i * 3600000)).toISOString() : null,
      next_vulnerable_window_end: vulnerable ? new Date(Date.now() + (172800000 + i * 3600000)).toISOString() : null,
      services: [],
      acl: { [i]: ['config', 'hangar_query'] },
    });
  }
  return list;
}

/** mock 结构名称解析（星系/类型），供 StructuresService.resolveNames 使用 */
export function mockStructureNames(raw: Array<Record<string, unknown>>): Record<number, { name: string; category?: string }> {
  const map: Record<number, { name: string; category?: string }> = {};
  for (const r of raw) {
    const t = STRUCTURE_TYPE_POOL.find((x) => x.id === Number(r.type_id));
    const s = STRUCTURE_SYSTEM_POOL.find((x) => x.id === Number(r.system_id));
    if (t) map[t.id] = { name: t.name, category: 'inventory_type' };
    if (s) map[s.id] = { name: s.name, category: 'solar_system' };
  }
  return map;
}

/** mock 星系 → 星座/星域映射，供 StructuresService.enrichLocations 使用 */
export function mockSystemCosmic(systemIds: number[]): Record<number, { constellationId: number; regionId: number; regionName: string }> {
  const map: Record<number, { constellationId: number; regionId: number; regionName: string }> = {};
  for (const s of STRUCTURE_SYSTEM_POOL) {
    if (systemIds.includes(s.id)) {
      map[s.id] = { constellationId: s.constellationId, regionId: s.regionId, regionName: s.regionName };
    }
  }
  return map;
}

/**
 * 联盟建筑（演示数据）。对齐 esi-alliances.read_structures.v1 返回字段：
 * 仅含 structure_id / type_id / system_id / profile_id / reinforcing_time / vulnerable_*，
 * 不含 state/fuel/services（ESI 联盟端点不提供）。
 */
export function mockAllianceStructures(allianceId: number): Array<Record<string, unknown>> {
  const seed = allianceId % 997;
  const count = 2 + (seed % 3); // 2~4 个建筑
  const list = [];
  for (let i = 0; i < count; i++) {
    const t = STRUCTURE_TYPE_POOL[(seed + i * 3) % STRUCTURE_TYPE_POOL.length];
    const s = STRUCTURE_SYSTEM_POOL[(seed + i * 2) % STRUCTURE_SYSTEM_POOL.length];
    const vulStart = new Date(Date.now() + (86400000 + i * 7200000)).toISOString();
    list.push({
      structure_id: 1_030_000_000_000 + seed * 100_000 + i * 1000,
      type_id: t.id,
      system_id: s.id,
      profile_id: null,
      reinforcing_time: new Date(Date.now() + (43200000 + i * 3600000)).toISOString(),
      vulnerable_start_time: vulStart,
      vulnerable_end_time: new Date(new Date(vulStart).getTime() + 172800000).toISOString(),
    });
  }
  return list;
}

export { CORPS, ALLIANCES };
