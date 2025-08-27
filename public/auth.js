document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = signupForm.username.value;
            const password = signupForm.password.value;
            errorMessage.textContent = '';

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                const result = await response.json();
                if (response.ok) {
                    alert('Sign up successful! Please log in.');
                    window.location.href = '/login.html';
                } else {
                    errorMessage.textContent = result.error || 'An unknown error occurred.';
                }
            } catch (err) {
                errorMessage.textContent = 'Failed to connect to the server.';
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;
            errorMessage.textContent = '';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                const result = await response.json();
                if (response.ok && result.token) {
                    localStorage.setItem('session_token', result.token);
                    window.location.href = '/manage.html';
                } else {
                    errorMessage.textContent = result.error || 'Invalid credentials.';
                }
            } catch (err) {
                errorMessage.textContent = 'Failed to connect to the server.';
            }
        });
    }
});
