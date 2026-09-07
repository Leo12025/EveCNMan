<template>
  <router-view />
</template>

<script setup lang="ts">
</script>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
  background: #0b1020;
  color: #e6e9f0;
}
* {
  box-sizing: border-box;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: #2a3550;
  border-radius: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
</style>
