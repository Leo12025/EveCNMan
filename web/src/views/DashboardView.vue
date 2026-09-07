<template>
  <div>
    <div class="toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <el-dropdown @command="doExport" split-button size="small" type="primary" plain>
          导出 CSV
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="members">成员列表</el-dropdown-item>
              <el-dropdown-item command="assets">资产清单</el-dropdown-item>
              <el-dropdown-item command="taxes">税单明细</el-dropdown-item>
              <el-dropdown-item command="rankings">排行榜</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="stat-grid">
      <div v-for="s in stats" :key="s.label" class="stat-card">
        <div class="stat-icon" :style="{ background: s.bg }">{{ s.icon }}</div>
        <div>
          <div class="stat-value">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="16" class="chart-row">
      <el-col :span="14">
        <div class="panel">
          <div class="panel-title">军税收入趋势（近 6 个月）</div>
          <div ref="taxChartRef" class="chart"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel">
          <div class="panel-title">成员 SP 分布</div>
          <div ref="spChartRef" class="chart"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">税收贡献排行</div>
          <el-table :data="rankings.taxRanking" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="#" width="48" prop="rank" />
            <el-table-column prop="characterName" label="成员" />
            <el-table-column label="缴纳" align="right">
              <template #default="{ row }">{{ fmtNumber(row.total) }} ISK</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">SP 排行</div>
          <el-table :data="rankings.spRanking" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="#" width="48" prop="rank" />
            <el-table-column prop="characterName" label="成员" />
            <el-table-column label="SP" align="right">
              <template #default="{ row }">{{ fmtNumber(row.sp) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">挖矿产量排行</div>
          <el-table :data="rankings.miningRanking" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="#" width="48" prop="rank" />
            <el-table-column prop="characterName" label="成员" />
            <el-table-column label="矿石量" align="right">
              <template #default="{ row }">{{ fmtNumber(row.quantity) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">战斗参与排行（KB）</div>
          <el-table :data="rankings.kbRanking" size="small" style="width: 100%" :class="'dark-table'">
            <el-table-column label="#" width="48" prop="rank" />
            <el-table-column prop="characterName" label="成员" />
            <el-table-column label="参战次数" align="right">
              <template #default="{ row }">{{ row.losses }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import { dashboardApi } from '../api';
import { fmtNumber } from '../utils/format';

const stats = reactive([
  { icon: '⌘', label: '管理联盟', value: '0', bg: 'linear-gradient(135deg,#4f7cff,#7a4fff)' },
  { icon: '▦', label: '管理军团', value: '0', bg: 'linear-gradient(135deg,#00b4d8,#0096c7)' },
  { icon: '☰', label: '成员总数', value: '0', bg: 'linear-gradient(135deg,#06d6a0,#00b894)' },
  { icon: '₡', label: '本月军税', value: '0 ISK', bg: 'linear-gradient(135deg,#ffb703,#fb8500)' },
  { icon: '◈', label: '资产总值', value: '0 ISK', bg: 'linear-gradient(135deg,#ff6b6b,#ee5a24)' },
  { icon: '⚡', label: '绑定账号', value: '0', bg: 'linear-gradient(135deg,#8ecae6,#219ebc)' },
]);

const rankings = reactive({ taxRanking: [], spRanking: [], activeRanking: [], miningRanking: [], kbRanking: [] });
const taxChartRef = ref<HTMLElement>();
const spChartRef = ref<HTMLElement>();
let taxChart: echarts.ECharts | null = null;
let spChart: echarts.ECharts | null = null;

onMounted(async () => {
  const [overview, charts, rank] = await Promise.all([
    dashboardApi.overview(),
    dashboardApi.charts(),
    dashboardApi.rankings(),
  ]);

  stats[0].value = String(overview.alliances);
  stats[1].value = String(overview.corporations);
  stats[2].value = String(overview.members);
  stats[3].value = fmtNumber(overview.monthTax) + ' ISK';
  stats[4].value = fmtNumber(overview.totalAssetValue) + ' ISK';
  stats[5].value = String(overview.boundAccounts);

  Object.assign(rankings, rank);

  renderTaxChart(charts.taxTrend);
  renderSpChart(charts.spDistribution);
});

function renderTaxChart(trend: any) {
  if (!taxChartRef.value) return;
  taxChart = echarts.init(taxChartRef.value);
  taxChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtNumber(v) + ' ISK' },
    legend: { textStyle: { color: '#9aa5c1' }, top: 0 },
    grid: { left: 48, right: 16, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: trend.months, axisLine: { lineStyle: { color: '#2a3550' } }, axisLabel: { color: '#7d89a8' } },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#7d89a8', formatter: (v: number) => fmtNumber(v) },
      splitLine: { lineStyle: { color: '#1a2340' } },
    },
    series: (trend.series || []).map((s: any) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      data: s.data,
      areaStyle: { opacity: 0.12 },
      lineStyle: { width: 2 },
    })),
  });
}

function renderSpChart(dist: any[]) {
  if (!spChartRef.value) return;
  spChart = echarts.init(spChartRef.value);
  spChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '52%'],
        itemStyle: { borderRadius: 6, borderColor: '#0d1226', borderWidth: 2 },
        label: { color: '#c6cfe8', fontSize: 11 },
        data: (dist || []).map((d) => ({ name: d.bucket, value: d.count })),
      },
    ],
  });
}

async function doExport(type: string) {
  try {
    const res = await dashboardApi.export(type);
    const blob = new Blob([res as any], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
}

function onResize() {
  taxChart?.resize();
  spChart?.resize();
}
window.addEventListener('resize', onResize);
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  taxChart?.dispose();
  spChart?.dispose();
});
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.toolbar-right { display: flex; gap: 8px; }
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
}
.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  flex-shrink: 0;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #eef2ff;
  white-space: nowrap;
}
.stat-label {
  font-size: 12px;
  color: #7d89a8;
  margin-top: 2px;
}
.chart-row {
  margin-bottom: 16px;
}
.panel {
  background: #111834;
  border: 1px solid #1e2942;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #c6cfe8;
  margin-bottom: 12px;
}
.chart {
  height: 280px;
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
