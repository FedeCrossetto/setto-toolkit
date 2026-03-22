# Bitbucket Code Search (wigos-dev)

Web app to search for a word or phrase across all repositories in the Bitbucket workspace **wigos-dev**. Use it to find where code is used and support refactoring.

## Quick start

1. Install dependencies and run the server:

   ```bash
   cd bitbucket-search-app
   npm install
   npm start
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser.

3. Sign in with your Bitbucket credentials (see below), then type a search term and click **Search**.

## Bitbucket credentials

The app uses the official Bitbucket Cloud API. You must sign in with:

- **Username:** Your Bitbucket username, or your Atlassian account email.
- **Password:** An **API Token** (recommended) or an **App Password**.

Your password is never stored on disk; it is kept only in the server session while you use the app.

### Create an API Token (recommended)

1. Log in to [Bitbucket](https://bitbucket.org).
2. Click your profile picture → **Personal settings** → **App passwords** or **API tokens** (depending on your Bitbucket/Atlassian account).
3. Create a new token with a clear name (e.g. *"Code search / refactor tool"*) and **read** permissions for repositories (or the minimum needed for code search).
4. Copy the token and use it as the password in the app. You won’t be able to see it again.

### Create an App Password (alternative)

1. In Bitbucket: **Personal settings** → **App passwords**.
2. Create an app password with **Repository read** (or equivalent) and use it as the password in the app.

Note: Atlassian is deprecating App Passwords; API tokens are the recommended long-term option.

## Environment variables (optional)

- **PORT** – Port for the server (default: `3000`).
- **BITBUCKET_WORKSPACE** – Workspace to search (default: `wigos-dev`).
- **SESSION_SECRET** – Secret for session cookies (set in production).

Example:

```bash
set PORT=4000
npm start
```

## How it works

- The app calls Bitbucket’s [Code Search API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-other-operations/#api-workspaces-workspace-search-code-get) for the workspace `wigos-dev`.
- Search uses the **default branch** (e.g. `main` / `master`) of each repository.
- Results show repository, file path, line number, and a code snippet; each result links to the file on Bitbucket so you can open it for refactoring.

## Refactoring workflow

1. Enter a symbol or phrase (e.g. a class or method name).
2. Review the list of files and lines where it appears.
3. Use **Open in Bitbucket** to jump to the file and make your changes.
