import axios from 'axios';

// Create central Axios instance pointing to FastAPI backend
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

// Interceptor: automatically attaches the JWT token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cui_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Authentication Endpoints ---
export const registerStudent = async (data) => (await api.post('/auth/register', data)).data;
export const loginUser = async (username, password) => (await api.post('/auth/login', { username, password })).data;

// --- Student Endpoints ---
export const getStudentProfile = async () => (await api.get('/student/me')).data;
export const sendChat = async (message) => (await api.post('/chat', { message })).data;
export const addTask = async (taskData) => (await api.post('/tasks', taskData)).data;
export const toggleTaskStatus = async (taskId, status) => (await api.put(`/tasks/${taskId}`, { status })).data;
export const removeTask = async (taskId) => (await api.delete(`/tasks/${taskId}`)).data;

// --- Admin Endpoints ---
export const fetchAllStudents = async () => (await api.get('/admin/students')).data;
export const updateStudentApproval = async (id, status) => (await api.put(`/admin/students/${id}/status`, { status })).data;
export const fetchPolicyDocs = async () => (await api.get('/admin/documents')).data;
export const updatePolicyDoc = async (id, content) => (await api.put(`/admin/documents/${id}`, { content })).data;
export const addRAGDocument = async (docData) => (await api.post('/admin/rag/add-document', docData)).data;
export const deletePolicyDoc = async (id) => (await api.delete(`/admin/documents/${id}`)).data;