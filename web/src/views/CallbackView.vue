<template>
  <div class="callback">
    <div class="card">
      <div class="spin"></div>
      <p>SSO 登录成功，正在进入管理后台...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const store = useUserStore();

onMounted(async () => {
  const token = route.query.token as string;
  if (token) {
    store.setToken(token);
    try {
      await store.fetchMe();
      router.replace('/dashboard');
      return;
    } catch {
      // fallthrough
    }
  }
  router.replace('/login?error=invalid');
});
</script>

<style scoped>
.callback {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1020;
}
.card {
  text-align: center;
  color: #9aa5c1;
}
.spin {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid #243052;
  border-top-color: #4f7cff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
