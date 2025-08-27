document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const elements = {
        logoutBtn: document.getElementById('logout-btn'),
        agentList: document.getElementById('agent-list'),
        createAgentForm: document.getElementById('create-agent-form'),
        agentNameInput: document.getElementById('agent-name'),
        agentSelect: document.getElementById('agent-select'),
        modelSelect: document.getElementById('model-select'),
        userInput: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        output: document.getElementById('output'),
        status: document.getElementById('status'),
    };

    // --- Authentication ---
    const token = localStorage.getItem('session_token');
    if (!token) {
        window.location.href = '/login.html';
        return; // Stop script execution
    }

    const authHeader = { 'Authorization': `Bearer ${token}` };

    // --- State ---
    let myAgents = [];

    // --- Functions ---
    const setStatus = (text) => elements.status.textContent = `Status: ${text}`;

    const fetchAndPopulate = async (endpoint, selectElement, valueField, textField, defaultOption) => {
        try {
            const response = await fetch(endpoint, { headers: authHeader });
            if (!response.ok) {
                if (response.status === 401) window.location.href = '/login.html';
                throw new Error(`Failed to fetch from ${endpoint}`);
            }
            const data = await response.json();
            selectElement.innerHTML = `<option value="">-- ${defaultOption} --</option>`;
            for (const item of data) {
                const option = document.createElement('option');
                option.value = item[valueField];
                option.textContent = item[textField];
                selectElement.appendChild(option);
            }
            return data;
        } catch (error) {
            console.error(error);
            setStatus(`Error loading ${defaultOption}`);
        }
    };

    const listMyAgents = async () => {
        myAgents = await fetchAndPopulate('/api/get-agents', elements.agentSelect, 'id', 'name', 'Select an agent');
        elements.agentList.innerHTML = '';
        if (myAgents && myAgents.length > 0) {
            myAgents.forEach(agent => {
                const li = document.createElement('li');
                li.textContent = `${agent.name} (ID: ${agent.id.substring(0, 8)}...)`;
                elements.agentList.appendChild(li);
            });
        } else {
            elements.agentList.innerHTML = '<li>No agents created yet.</li>';
        }
    };

    const listModels = () => fetchAndPopulate('/api/models', elements.modelSelect, 'id', 'label', 'Select a model');

    const handleCreateAgent = async (event) => {
        event.preventDefault();
        const agentName = elements.agentNameInput.value.trim();
        if (!agentName) return;

        setStatus('Creating agent...');
        try {
            const response = await fetch('/api/create-agent', {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: agentName }),
            });
            const result = await response.json();
            if (response.ok) {
                elements.agentNameInput.value = '';
                await listMyAgents();
                setStatus('Agent created successfully!');
            } else {
                throw new Error(result.error || 'Failed to create agent.');
            }
        } catch (error) {
            setStatus(error.message);
        }
    };

    const handleSendMessage = async () => {
        const agentId = elements.agentSelect.value;
        const model = elements.modelSelect.value;
        const message = elements.userInput.value;

        if (!agentId || !model || !message) {
            alert('Please select an agent, a model, and enter a message.');
            return;
        }

        setStatus('Sending message...');
        elements.output.textContent = '';

        try {
            const response = await fetch(`/agents/MyAgent/${agentId}`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: message }] }),
            });

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulatedText += decoder.decode(value, { stream: true });
                elements.output.textContent = accumulatedText;
            }
            setStatus('Response complete.');

        } catch (error) {
            console.error('Chat error:', error);
            setStatus(`Error: ${error.message}`);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('session_token');
        window.location.href = '/login.html';
    };

    // --- Event Listeners ---
    elements.createAgentForm.addEventListener('submit', handleCreateAgent);
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.logoutBtn.addEventListener('click', handleLogout);

    // --- Initial Load ---
    setStatus('Loading...');
    Promise.all([listMyAgents(), listModels()]).then(() => {
        setStatus('Ready');
    });
});
