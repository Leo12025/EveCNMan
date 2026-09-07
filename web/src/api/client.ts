import axios, { type AxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('eveman_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (resp) => resp.data,
  (error) => {
    const status = error?.response?.status;
    const msg = error?.response?.data?.message;
    if (status === 401) {
      localStorage.removeItem('eveman_token');
      if (location.hash !== '#/login') location.hash = '#/login';
      ElMessage.error('登录已过期，请重新登录');
    } else {
      ElMessage.error(typeof msg === 'string' ? msg : (error?.message || '请求失败'));
    }
    return Promise.reject(error);
  },
);

/**
 * 类型包装：拦截器已将响应解包为 data，
 * 因此 get/post 等直接返回 Promise<T> 而非 AxiosResponse<T>。
 */
export interface HttpClient {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

const client = http as unknown as HttpClient;
export default client;
