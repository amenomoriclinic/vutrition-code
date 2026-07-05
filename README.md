# Nutrition Management Web App

Next.js app for personal nutrition logging with Claude Vision image estimation.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variable:
   ```bash
   export CLAUDE_API_KEY=your_api_key
   ```
   On Windows PowerShell:
   ```powershell
   $env:CLAUDE_API_KEY = "your_api_key"
   ```
3. Start development server:
   ```bash
   npm run dev
   ```

## Notes

- The API route at `app/api/vision/route.ts` keeps the Claude API key server-side.
- Records and profile data are stored locally in the browser using `localStorage`.
- The app includes a built-in favorite food preset for イノラス.
