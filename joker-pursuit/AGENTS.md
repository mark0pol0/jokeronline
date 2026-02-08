# Agent Workflow Rules

## Required Completion Steps
- After any requested code/content change, complete all of these steps before ending the task:
1. Commit the intended files with a clear commit message.
2. Push the current branch to `origin`.
3. Deploy the frontend to Vercel.
4. Deploy the backend to Render.

## Exceptions
- Only skip one of the required steps if the user explicitly asks to skip it.
- If a step is blocked by missing credentials, missing CLI tooling, or environment limitations, still attempt a reasonable fallback and then report the exact blocker.

## Required Reporting
- Include these in the final status update:
1. Commit hash and commit message.
2. Pushed branch and remote.
3. Vercel deployment result (URL or explicit failure reason).
4. Render deployment result (URL or explicit failure reason).
