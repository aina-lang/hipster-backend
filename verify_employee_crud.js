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
    console.log('--- STARTING EMPLOYEE CRUD VERIFICATION ---');

    // 1. CREATE
    console.log('\n1. Creating Employee...');
    const createRes = await request('POST', '/users', {
        firstName: 'Emp',
        lastName: 'Loyee',
        email: `emp.loyee.${Date.now()}@example.com`,
        password: 'password123',
        phones: ['0341111111'],
        roles: ['employee'],
        employeeProfile: {
            poste: 'DevOps Engineer'
        }
    });
    console.log('Create Status:', createRes.status);
    if (createRes.status !== 201) {
        console.error('Create Failed:', createRes.data);
        return;
    }
    const userId = createRes.data.data.id;
    console.log('Created User ID:', userId);

    // 2. LIST
    console.log('\n2. Listing Employees...');
    const listRes = await request('GET', '/users/employees?page=1&limit=10');
    console.log('List Status:', listRes.status);
    const found = listRes.data.data.find(u => u.id === userId);
    console.log('User found in list:', !!found);

    // 3. GET ONE
    console.log('\n3. Get One...');
    const getRes = await request('GET', `/users/${userId}`);
    console.log('Get One Status:', getRes.status);
    console.log('Poste:', getRes.data.data.employeeProfile?.poste);

    // 4. UPDATE
    console.log('\n4. Updating Employee...');
    const updateRes = await request('PATCH', `/users/${userId}`, {
        firstName: 'EmpUpdated',
        employeeProfile: {
            poste: 'Senior DevOps Engineer'
        }
    });
    console.log('Update Status:', updateRes.status);

    // 5. VERIFY UPDATE
    console.log('\n5. Verifying Update...');
    const verifyRes = await request('GET', `/users/${userId}`);
    console.log('Updated Name:', verifyRes.data.data.firstName);
    console.log('Updated Poste:', verifyRes.data.data.employeeProfile?.poste);

    // 6. DELETE
    console.log('\n6. Deleting Employee...');
    const deleteRes = await request('DELETE', `/users/${userId}`);
    console.log('Delete Status:', deleteRes.status);

    // 7. VERIFY DELETE
    console.log('\n7. Verifying Delete...');
    const finalRes = await request('GET', `/users/${userId}`);
    console.log('Final Get Status:', finalRes.status); // Should be 404
}

run();
