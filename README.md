# AI Agent SaaS Platform

This project is a powerful, multi-tenant AI agent platform built on Cloudflare Workers. It provides a complete end-to-end solution for users to sign up, create and manage multiple AI agents, and interact with them through a collaborative, self-improving chat interface.

## Features

- **User Accounts:** A full user authentication system with sign-up and login.
- **Metered Billing:** Free-tier users can create up to 3 agents.
- **Stripe Integration:** A seamless upgrade path to a paid plan for unlimited agents.
- **Advanced Agents:**
    - **Collaborative Chat:** Multiple AI models work together to provide the best possible response.
    - **Delegation:** Agents can create and delegate tasks to sub-agents.
    - **Tool Use:** Agents can use tools like web search to answer questions.
- **Self-Improving Knowledge:** A feedback mechanism allows the AI's knowledge base to be updated and corrected over time using Cloudflare's AutoRAG pipeline.

## How to Use the Application

This guide explains how to use the application from an end-user's perspective.

### 1. Create an Account

- Navigate to `/signup.html` to create a new account.
- You will need to provide a unique username and a password.
- The first user to sign up with the username `admin` will be granted the admin role with unlimited agent creation.

### 2. Log In

- Navigate to `/login.html` to log in to your account.
- Upon successful login, you will be redirected to the main Agent Management dashboard.

### 3. The Management Dashboard (`/manage.html`)

The management dashboard is the central hub for interacting with the platform. It is split into two main sections.

#### Agent Administration

On the left side, you can manage your agents:

- **View Agents:** A list of your existing agents is displayed here.
- **Create a New Agent:** Enter a name for your new agent in the "Agent Name" input and click "Create Agent". If you are on a free plan and have reached your limit of 3 agents, you will be prompted to upgrade.

#### Interacting with Agents

On the right side, you can interact with your agents:

1.  **Select an Agent:** Choose the agent you want to interact with from the "Select Agent" dropdown.
2.  **Select a Synthesizer Model:** Choose the powerful AI model that will synthesize the final response.
3.  **Chat:** Type your message in the "Your Message" text area and click "Send Message". The platform will perform its collaborative chat orchestration and stream the final, synthesized response back to you.
4.  **Provide Feedback:** If you receive a response that is incorrect, click the "Mark as Incorrect" button that appears below it. This will trigger the AutoRAG pipeline to search the web for better information and update its knowledge base for future queries.
5.  **Delegate a Task:** Enter a task description (e.g., "Summarize the top 5 results for 'Cloudflare'") in the "Task Description" text area and click "Delegate Task to Selected Agent". Your chosen agent will create a new sub-agent to handle the task, and the result will be displayed in the "Delegation Result" box.

### 4. Upgrading Your Plan

- If you are on the free plan and attempt to create a fourth agent, an "Upgrade to Paid Plan" button will appear.
- Clicking this button will redirect you to a Stripe checkout page to complete your subscription.
- Upon successful payment, your account will be automatically upgraded, and you will be able to create unlimited agents.
