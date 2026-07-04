import client from './client';

export async function login(employeeId, password) {
  const { data } = await client.post('/auth/login', { employeeId, password });
  return data;
}

export async function getCurrentUser() {
  const { data } = await client.get('/auth/me');
  return data;
}
