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
        upgradeSection: document.getElementById('upgrade-section'),
        upgradeMessage: document.getElementById('upgrade-message'),
        upgradeBtn: document.getElementById('upgrade-btn'),
        taskDescription: document.getElementById('task-description'),
        delegateBtn: document.getElementById('delegate-btn'),
        delegateOutput: document.getElementById('delegate-output'),
    };

    // --- Authentication ---
    const token = localStorage.getItem('session_token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    const authHeader = { 'Authorization': `Bearer ${token}` };

    // --- State ---
    let lastQuery = '';

    // --- Functions ---
    const setStatus = (text) => elements.status.textContent = `Status: ${text}`;

    const fetchAndPopulate = async (endpoint, selectElement, valueField, textField, defaultOption) => {
        // ... (existing code)
        try {
            const response = await fetch(endpoint, { headers: authHeader });
            if (!response.ok) {
                if (response.status === 401) window.location.href = '/login.html';
                throw new Error(`Failed to fetch from ${endpoint}`);
            }
            const data = await response.json();
            if (selectElement) {
                selectElement.innerHTML = `<option value="">-- ${defaultOption} --</option>`;
                for (const item of data) {
                    const option = document.createElement('option');
                    option.value = item[valueField];
                    option.textContent = item[textField];
                    selectElement.appendChild(option);
                }
            }
            return data;
        } catch (error) {
            console.error(error);
            setStatus(`Error loading ${defaultOption}`);
        }
    };

    const listMyAgents = async () => {
        // ... (existing code)
        const myAgents = await fetchAndPopulate('/api/get-agents', elements.agentSelect, 'id', 'name', 'Select an agent');
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

    const handleUpgrade = async () => {
        // ... (existing code)
        setStatus('Redirecting to payment...');
        try {
            const response = await fetch('/api/create-checkout-session', { method: 'POST', headers: authHeader });
            const { url: stripeUrl } = await response.json();
            if (stripeUrl) window.location.href = stripeUrl;
            else throw new Error('Could not create payment session.');
        } catch (error) {
            setStatus(error.message);
        }
    };

    const handleCreateAgent = async (event) => {
        // ... (existing code)
        event.preventDefault();
        elements.upgradeSection.style.display = 'none';
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
                if (response.status === 403) {
                    elements.upgradeMessage.textContent = result.error;
                    elements.upgradeSection.style.display = 'block';
                }
                throw new Error(result.error || 'Failed to create agent.');
            }
        } catch (error) {
            setStatus(error.message);
        }
    };

    const handleFeedback = async () => {
        // ... (existing code)
        if (!lastQuery) {
            alert('No recent query to provide feedback on.');
            return;
        }
        setStatus(`Sending feedback for query: "${lastQuery}"`);
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: lastQuery }),
            });
            if (!response.ok) throw new Error('Failed to send feedback.');
            setStatus('Feedback received. The agent will learn from this.');
        } catch (error) {
            setStatus(`Error sending feedback: ${error.message}`);
        }
    };

    const handleSendMessage = async () => {
        const agentId = elements.agentSelect.value;
        const model = elements.modelSelect.value; // This is now the synthesizer model
        const message = elements.userInput.value;
        lastQuery = message;

        if (!agentId || !model || !message) {
            alert('Please select an agent, a synthesizer model, and enter a message.');
            return;
        }

        setStatus('Orchestrating response... (This may take a moment)');
        elements.output.innerHTML = '';

        const responseContainer = document.createElement('div');
        const responseText = document.createElement('p');
        responseContainer.appendChild(responseText);
        elements.output.appendChild(responseContainer);

        try {
            const response = await fetch(`/agents/MyAgent/${agentId}`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'chat', model, messages: [{ role: 'user', content: message }] }),
            });
            if (!response.body) throw new Error('No response body');

            setStatus('Synthesizing final answer...');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulatedText += decoder.decode(value, { stream: true });
                responseText.textContent = accumulatedText;
            }
            setStatus('Response complete.');

            const feedbackButton = document.createElement('button');
            feedbackButton.textContent = 'Mark as Incorrect';
            feedbackButton.onclick = handleFeedback;
            responseContainer.appendChild(feedbackButton);

        } catch (error) {
            console.error('Chat error:', error);
            responseText.textContent = `Error: ${error.message}`;
            setStatus(`Error: ${error.message}`);
        }
    };

    const handleDelegateTask = async () => {
        // ... (existing delegate logic)
        const agentId = elements.agentSelect.value;
        const taskDescription = elements.taskDescription.value.trim();
        if (!agentId || !taskDescription) {
            alert('Please select an agent and enter a task description.');
            return;
        }
        setStatus('Delegating task...');
        elements.delegateOutput.textContent = '';
        try {
            const response = await fetch('/api/delegate-task', {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, taskDescription }),
            });
            const result = await response.json();
            elements.delegateOutput.textContent = JSON.stringify(result, null, 2);
            setStatus('Delegation complete.');
        } catch (error) {
            console.error('Delegation error:', error);
            elements.delegateOutput.textContent = `Error: ${error.message}`;
            setStatus('Delegation failed.');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('session_token');
        window.location.href = '/login.html';
    };

    // --- Event Listeners ---
    elements.createAgentForm.addEventListener('submit', handleCreateAgent);
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.delegateBtn.addEventListener('click', handleDelegateTask);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.upgradeBtn.addEventListener('click', handleUpgrade);

    // --- Initial Load ---
    setStatus('Loading...');
    Promise.all([listMyAgents(), listModels()]).then(() => {
        setStatus('Ready');
    });
});
