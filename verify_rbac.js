const API_URL = 'http://localhost:4000/api';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsInJvbGVzIjpbImFkbWluIl0sImlhdCI6MTc2MzcwNzA0NywiZXhwIjoxNzYzNzA3OTQ3fQ.dRIwur0oVATo5Xkc3SC-a0S0PBnjmlGZ__50DD7RZt0';

async function request(method, path, body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
    };
    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };
    try {
        const res = await fetch(`${API_URL}${path}`, options);
        const data = await res.json();
        return { status: res.status, data };
    } catch (error) {
        return { status: 500, data: { message: error.message } };
    }
}

async function run() {
    console.log('--- STARTING RBAC VERIFICATION ---');

    // 1. CREATE PERMISSION
    console.log('\n1. Creating Permission...');
    const permRes = await request('POST', '/permissions', {
        slug: `test:perm:${Date.now()}`,
        description: 'Test Permission'
    });
    console.log('Create Permission Status:', permRes.status);
    if (permRes.status !== 201) {
        console.error('Failed:', permRes.data);
        return;
    }
    const permId = permRes.data.id;
    console.log('Permission ID:', permId);

    // 2. CREATE ROLE WITH PERMISSION
    console.log('\n2. Creating Role...');
    const roleRes = await request('POST', '/roles', {
        name: `Test Role ${Date.now()}`,
        description: 'Test Role Description',
        permissionIds: [permId]
    });
    console.log('Create Role Status:', roleRes.status);
    if (roleRes.status !== 201) {
        console.error('Failed:', roleRes.data);
        return;
    }
    const roleId = roleRes.data.id;
    console.log('Role ID:', roleId);

    // 3. VERIFY ROLE HAS PERMISSION
    console.log('\n3. Verifying Role Permissions...');
    const getRoleRes = await request('GET', `/roles/${roleId}`);
    console.log('Get Role Status:', getRoleRes.status);
    const hasPerm = getRoleRes.data.permissions.some(p => p.id === permId);
    console.log('Role has permission:', hasPerm);

    // 4. CLEANUP
    console.log('\n4. Cleanup...');
    await request('DELETE', `/roles/${roleId}`);
    await request('DELETE', `/permissions/${permId}`);
    console.log('Cleanup Done');
}

run();
