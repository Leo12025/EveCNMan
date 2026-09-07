<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="军团挂单" name="orders">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="query.orgId" placeholder="全部军团" clearable size="small" style="width: 200px" @change="loadOrders">
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-select v-model="query.side" placeholder="方向" clearable size="small" style="width: 110px" @change="loadOrders">
              <el-option label="收购" value="buy" />
              <el-option label="出售" value="sell" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="orderVisible = true">新建挂单</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="orders" size="small" style="width: 100%" :class="'dark-table'" v-loading="loadingOrders">
            <el-table-column prop="typeName" label="物品" min-width="160" />
            <el-table-column label="方向" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.side === 'buy' ? 'warning' : 'success'">{{ row.side === 'buy' ? '收购' : '出售' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="regionName" label="区域" min-width="110" />
            <el-table-column label="价格" width="110" align="right">
              <template #default="{ row }">{{ fmtNumber(row.price) }}</template>
            </el-table-column>
            <el-table-column label="剩余" width="90" align="right">
              <template #default="{ row }">{{ row.volumeRemain.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="监控价" width="110" align="right">
              <template #default="{ row }">{{ row.watchPrice ? fmtNumber(row.watchPrice) : '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="orderStatusType(row.state)">{{ orderStatusLabel(row.state) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.state === 'open' && store.isOfficer" size="small" type="danger" plain @click="cancelOrder(row)">撤单</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!orders.length" class="empty">暂无挂单</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="多区域比价" name="compare">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-input v-model="compareTypeId" placeholder="物品 TypeID" size="small" style="width: 130px" />
            <el-select v-model="compareRegions" multiple size="small" style="width: 320px" placeholder="选择对比区域">
              <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
            <el-button size="small" type="primary" plain @click="doCompare">查询比价</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table v-if="compareResult.length" :data="compareResult" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="区域" min-width="140">
              <template #default="{ row }">{{ regionName(row.regionId) }}</template>
            </el-table-column>
            <el-table-column label="最高收购价" align="right">
              <template #default="{ row }">{{ fmtNumber(row.buy) }}</template>
            </el-table-column>
            <el-table-column label="最低出售价" align="right">
              <template #default="{ row }">{{ fmtNumber(row.sell) }}</template>
            </el-table-column>
            <el-table-column label="可套利价差" align="right">
              <template #default="{ row }"><span :class="{ profit: row.buy > row.sell }">{{ fmtNumber(row.buy - row.sell) }}</span></template>
            </el-table-column>
            <el-table-column label="挂单量" align="right">
              <template #default="{ row }">{{ row.volume.toLocaleString() }}</template>
            </el-table-column>
          </el-table>
          <div v-if="!compareResult.length" class="empty">输入 TypeID 并选择区域后点击查询</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="价格走势" name="trend">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-input v-model="trendTypeId" placeholder="物品 TypeID" size="small" style="width: 130px" />
            <el-select v-model="trendRegion" size="small" style="width: 180px" placeholder="区域">
              <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
            <el-select v-model="trendDays" size="small" style="width: 130px">
              <el-option label="近 7 天" :value="7" />
              <el-option label="近 30 天" :value="30" />
              <el-option label="近 90 天" :value="90" />
            </el-select>
            <el-button size="small" type="primary" plain @click="loadTrend">查询走势</el-button>
          </div>
        </div>
        <div class="panel">
          <div ref="trendChartRef" style="width: 100%; height: 360px"></div>
          <div v-if="!trendLoaded" class="empty">输入 TypeID 并选择区域后查询价格走势</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="价格监控" name="watches">
        <div class="toolbar">
          <div class="toolbar-right">
            <el-button v-if="store.isOfficer" size="small" type="primary" plain @click="watchVisible = true">添加监控</el-button>
          </div>
        </div>
        <div class="panel">
          <el-table :data="watches" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column prop="typeName" label="物品" min-width="160" />
            <el-table-column prop="regionName" label="区域" min-width="120" />
            <el-table-column label="收购价" align="right" width="110">
              <template #default="{ row }">{{ fmtNumber(row.buy) }}</template>
            </el-table-column>
            <el-table-column label="出售价" align="right" width="110">
              <template #default="{ row }">{{ fmtNumber(row.sell) }}</template>
            </el-table-column>
            <el-table-column label="断货" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.outOfStock ? 'danger' : 'success'">{{ row.outOfStock ? '断货' : '正常' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="160">
              <template #default="{ row }">{{ new Date(row.updatedAt).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
          <div v-if="!watches.length" class="empty">暂无监控项</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建挂单 -->
    <el-dialog v-model="orderVisible" title="新建挂单" width="480px">
      <el-form :model="orderForm" label-width="90px">
        <el-form-item label="军团">
          <el-select v-model="orderForm.orgId" style="width: 100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="物品名" required><el-input v-model="orderForm.typeName" /></el-form-item>
        <el-form-item label="TypeID"><el-input-number v-model="orderForm.typeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="区域">
          <el-select v-model="orderForm.regionId" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="方向">
          <el-radio-group v-model="orderForm.side">
            <el-radio-button label="buy">收购</el-radio-button>
            <el-radio-button label="sell">出售</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="价格 ISK" required><el-input-number v-model="orderForm.price" :min="0" :step="1000" style="width: 100%" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="orderForm.volumeRemain" :min="1" style="width: 100%" /></el-form-item>
        <el-form-item label="监控价"><el-input-number v-model="orderForm.watchPrice" :min="0" :step="1000" style="width: 100%" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orderVisible = false">取消</el-button>
        <el-button type="primary" @click="doCreateOrder">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加监控 -->
    <el-dialog v-model="watchVisible" title="添加价格监控" width="460px">
      <el-form :model="watchForm" label-width="90px">
        <el-form-item label="物品名" required><el-input v-model="watchForm.typeName" /></el-form-item>
        <el-form-item label="TypeID"><el-input-number v-model="watchForm.typeId" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="区域">
          <el-select v-model="watchForm.regionId" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="watchVisible = false">取消</el-button>
        <el-button type="primary" @click="doWatch">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, nextTick, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';
import { marketApi, orgApi } from '../api';
import { fmtNumber } from '../utils/format';
import { useUserStore } from '../stores/user';

const store = useUserStore();
const tab = ref('orders');
const orders = ref<any[]>([]);
const loadingOrders = ref(false);
const orgOptions = ref<any[]>([]);
const orderVisible = ref(false);
const watchVisible = ref(false);
const watches = ref<any[]>([]);
const compareResult = ref<any[]>([]);
const compareTypeId = ref('');
const compareRegions = ref<number[]>([]);
const trendTypeId = ref('');
const trendRegion = ref(10000001);
const trendDays = ref(30);
const trendLoaded = ref(false);
const trendChartRef = ref<HTMLElement | null>(null);
let trendChart: echarts.ECharts | null = null;
const regions = [
  { id: 10000001, name: '德里克' },
  { id: 10000002, name: '长征' },
  { id: 10000043, name: '外域' },
  { id: 10000030, name: '瑰丽海' },
  { id: 10000048, name: '普莱克特' },
  { id: 10000068, name: '埃索' },
];
const query = reactive({ orgId: undefined as number | undefined, side: undefined as string | undefined });
const orderForm = reactive({ orgId: undefined as number | undefined, typeName: '', typeId: 0, regionId: 10000001, side: 'buy', price: 0, volumeRemain: 1, watchPrice: undefined as number | undefined });
const watchForm = reactive({ typeName: '', typeId: 0, regionId: 10000001 });

onMounted(async () => {
  orgOptions.value = (await orgApi.list({ managedOnly: true, type: 'corporation' })).filter((o: any) => o.type === 'corporation');
  loadOrders();
  loadWatches();
});

async function loadOrders() {
  loadingOrders.value = true;
  try {
    orders.value = await marketApi.listOrders({ ...query, state: undefined });
  } finally {
    loadingOrders.value = false;
  }
}

async function loadWatches() {
  watches.value = await marketApi.watches();
}

async function doCreateOrder() {
  if (!orderForm.orgId || !orderForm.typeName || !orderForm.price) return ElMessage.warning('请填写必填项');
  const region = regions.find((r) => r.id === orderForm.regionId);
  await marketApi.createOrder({ ...orderForm, orgType: 'corporation', regionName: region?.name, volumeTotal: orderForm.volumeRemain, state: 'open' });
  ElMessage.success('挂单已创建');
  orderVisible.value = false;
  loadOrders();
}

async function cancelOrder(row: any) {
  await ElMessageBox.confirm(`确认撤销 ${row.typeName} 的挂单？`, '撤销挂单');
  await marketApi.cancelOrder(row.id);
  ElMessage.success('已撤单');
  loadOrders();
}

async function doCompare() {
  if (!compareTypeId.value || !compareRegions.value.length) return ElMessage.warning('请输入 TypeID 并选择区域');
  compareResult.value = await marketApi.compare(Number(compareTypeId.value), compareRegions.value);
}

async function loadTrend() {
  if (!trendTypeId.value) return ElMessage.warning('请输入物品 TypeID');
  const series = await marketApi.history({
    regionId: trendRegion.value,
    typeId: Number(trendTypeId.value),
    days: trendDays.value,
  });
  trendLoaded.value = true;
  await nextTick();
  renderTrend(series);
}

function renderTrend(series: any[]) {
  if (!trendChartRef.value) return;
  if (!trendChart) trendChart = echarts.init(trendChartRef.value);
  trendChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtNumber(v) + ' ISK' },
    legend: { data: ['均价', '最高', '最低'], textStyle: { color: '#7d89a8' } },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: series.map((s) => s.date), axisLabel: { color: '#7d89a8' } },
    yAxis: { type: 'value', axisLabel: { color: '#7d89a8', formatter: (v: number) => fmtNumber(v) } },
    series: [
      { name: '均价', type: 'line', smooth: true, data: series.map((s) => s.avgPrice), itemStyle: { color: '#409eff' } },
      { name: '最高', type: 'line', smooth: true, data: series.map((s) => s.highest), itemStyle: { color: '#46a758' } },
      { name: '最低', type: 'line', smooth: true, data: series.map((s) => s.lowest), itemStyle: { color: '#e5484d' } },
    ],
  });
}

onUnmounted(() => { trendChart?.dispose(); });

async function doWatch() {
  if (!watchForm.typeName) return ElMessage.warning('请输入物品名');
  const region = regions.find((r) => r.id === watchForm.regionId);
  await marketApi.watch({ ...watchForm, typeName: watchForm.typeName, regionName: region?.name, buy: 0, sell: 0, volume: 0, outOfStock: false });
  ElMessage.success('监控已添加');
  watchVisible.value = false;
  loadWatches();
}

function regionName(id: number) {
  return regions.find((r) => r.id === id)?.name || String(id);
}
function orderStatusLabel(s: string) {
  return { open: '挂单中', closed: '已成交', cancelled: '已撤销' }[s] || s;
}
function orderStatusType(s: string) {
  return { open: 'success', closed: 'info', cancelled: 'danger' }[s] || 'info';
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.panel { background: #111834; border: 1px solid #1e2942; border-radius: 12px; padding: 16px; }
.dark-table { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: #151d3a; --el-table-border-color: #1e2942; --el-table-text-color: #c6cfe8; --el-table-header-text-color: #7d89a8; --el-table-row-hover-bg-color: #16203c; }
.profit { color: #46a758; font-weight: 600; }
.empty { color: #5b6780; text-align: center; padding: 24px 0; font-size: 13px; }
</style>
