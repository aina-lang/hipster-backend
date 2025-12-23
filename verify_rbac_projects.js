const API_URL = 'http://localhost:3000';

async function request(url, method = 'GET', body = null, token = null) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${url}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw { response: { data }, message: `Request failed: ${response.status} ${response.statusText}` };
    }

    return { data };
}

async function verifyRBAC() {
    try {
        console.log('🚀 Starting RBAC Verification...');

        // 1. Create Chef de Projet User
        console.log('\n👤 Creating Chef de Projet...');
        const pmEmail = `pm_${Date.now()}@test.com`;
        const pmPassword = 'password123';

        let pmUser;
        try {
            const regPm = await request('/auth/register', 'POST', {
                email: pmEmail,
                password: pmPassword,
                firstName: 'Chef',
                lastName: 'Projet',
                clientType: 'individual'
            });
            pmUser = regPm.data.user;
            console.log('✅ PM Registered:', pmUser.email);
        } catch (e) {
            console.error('❌ Failed to register PM:', e.response?.data || e.message);
            return;
        }

        // Login PM to get token
        const pmLogin = await request('/auth/login', 'POST', {
            email: pmEmail,
            password: pmPassword
        });
        const pmToken = pmLogin.data.accessToken;
        pmUser.id = pmLogin.data.user.id;

        // Update PM Profile to set Poste = 'Chef de Projet'
        await request(`/users/${pmUser.id}`, 'PATCH', {
            employeeProfile: {
                poste: 'Chef de Projet'
            }
        }, pmToken);
        console.log('✅ PM Profile updated with poste "Chef de Projet"');


        // 2. Create Developer User
        console.log('\n👤 Creating Developer...');
        const devEmail = `dev_${Date.now()}@test.com`;
        const devPassword = 'password123';

        let devUser;
        try {
            const regDev = await request('/auth/register', 'POST', {
                email: devEmail,
                password: devPassword,
                firstName: 'Dev',
                lastName: 'Elopper',
                clientType: 'individual'
            });
            devUser = regDev.data.user;
            console.log('✅ Developer Registered:', devUser.email);
        } catch (e) {
            console.error('❌ Failed to register Dev:', e.response?.data || e.message);
            return;
        }

        // Login Dev
        const devLogin = await request('/auth/login', 'POST', {
            email: devEmail,
            password: devPassword
        });
        const devToken = devLogin.data.accessToken;
        devUser.id = devLogin.data.user.id;

        // Update Dev Profile to set Poste = 'Développeur'
        await request(`/users/${devUser.id}`, 'PATCH', {
            employeeProfile: {
                poste: 'Développeur'
            }
        }, devToken);
        console.log('✅ Developer Profile updated with poste "Développeur"');


        // 3. Create Project (by PM)
        console.log('\n🏗️ Creating Project (by PM)...');
        const projectData = {
            name: `Project RBAC ${Date.now()}`,
            description: 'Test Project for RBAC',
            start_date: new Date().toISOString(),
            clientId: pmUser.id,
        };

        let project;
        try {
            const createRes = await request('/projects', 'POST', projectData, pmToken);
            project = createRes.data;
            console.log('✅ Project Created:', project.name, '(ID:', project.id, ')');
        } catch (e) {
            console.error('❌ Failed to create project:', e.response?.data || e.message);
            return;
        }

        // 4. Assign Developer to Project
        console.log('\n🔗 Assigning Developer to Project...');
        try {
            await request(`/projects/${project.id}`, 'PATCH', {
                members: [
                    { employeeId: devUser.id, role: 'DEVELOPER' }
                ]
            }, pmToken);
            console.log('✅ Developer assigned to project');
        } catch (e) {
            console.error('❌ Failed to assign developer:', e.response?.data || e.message);
        }


        // 5. Create Unassigned Project (by PM)
        console.log('\n🏗️ Creating Unassigned Project...');
        let unassignedProject;
        try {
            const createRes2 = await request('/projects', 'POST', {
                ...projectData,
                name: `Unassigned Project ${Date.now()}`
            }, pmToken);
            unassignedProject = createRes2.data;
            console.log('✅ Unassigned Project Created:', unassignedProject.name);
        } catch (e) {
            console.error('❌ Failed to create unassigned project:', e.response?.data || e.message);
        }


        // 6. Verify Access
        console.log('\n🔍 Verifying Access...');

        // PM should see BOTH projects
        const pmProjects = await request('/projects', 'GET', null, pmToken);
        console.log(`PM sees ${pmProjects.data.data.length} projects`);
        const pmHasProject1 = pmProjects.data.data.find(p => p.id === project.id);
        const pmHasProject2 = pmProjects.data.data.find(p => p.id === unassignedProject.id);

        if (pmHasProject1 && pmHasProject2) {
            console.log('✅ PM sees ALL projects');
        } else {
            console.error('❌ PM missing projects');
        }


        // Developer should see ONLY assigned project
        const devProjects = await request('/projects', 'GET', null, devToken);
        console.log(`Developer sees ${devProjects.data.data.length} projects`);

        const devHasProject1 = devProjects.data.data.find(p => p.id === project.id);
        const devHasProject2 = devProjects.data.data.find(p => p.id === unassignedProject.id);

        if (devHasProject1) {
            console.log('✅ Developer sees assigned project');
        } else {
            console.error('❌ Developer CANNOT see assigned project');
        }

        if (!devHasProject2) {
            console.log('✅ Developer DOES NOT see unassigned project');
        } else {
            console.error('❌ Developer SEES unassigned project (FAIL)');
        }

    } catch (error) {
        console.error('❌ Unexpected Error:', error);
    }
}

verifyRBAC();
