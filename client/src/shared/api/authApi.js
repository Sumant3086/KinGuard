import client from './client';

export async function login(employeeId, password) {
  const { data } = await client.post('/auth/login', { employeeId, password });
  // Returns { user } only — access token is set as HttpOnly cookie by server
  return data;
}

export async function getCurrentUser() {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function logout() {
  // Clears both HttpOnly cookies on the server and revokes the refresh token
  await client.post('/auth/logout');
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await client.post('/auth/change-password', { currentPassword, newPassword });
  return data;
}

export async function updateProfile(fields) {
  const { data } = await client.patch('/auth/profile', fields);
  return data;
}
