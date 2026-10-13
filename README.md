# NSAAI Studio — Gemini Free Tier

1. Get a Gemini API key at https://aistudio.google.com/api-keys (check that your selected model has free-tier access).
2. In Netlify, open your existing site > Project configuration > Environment variables > Add variable. Name: `GEMINI_API_KEY`; value: your key. Do NOT put the key in JavaScript or share it.
3. Deploy this entire **unzipped folder**, including the `netlify/functions` directory, using Netlify CLI (`netlify deploy --prod --dir . --functions netlify/functions`) or a Git-connected Netlify deployment. Verify the Functions list includes `studio-ai`. A static-only drag/drop deploy may not bundle functions; use Git/CLI if needed.
4. After setting/changing environment variables, redeploy. Open the platform > Try the Demo > Studio; send a message.
5. Test an inventor query and a multi-turn idea conversation.

The AI receives recent messages and up to 5 relevant **metadata-only** source records from the provided 100-source collection. No full-text indexing or training. Existing Studio browser-local chat storage is retained. The Gemini API key is server-side only.

IMPORTANT BEFORE PUBLIC LAUNCH: This testing build does NOT enforce server-side per-user quotas, bot protection, or Firebase identity verification. Public traffic can exhaust your free Gemini allowance. Add authenticated Firebase ID token verification, durable server-side rate limits, abuse controls, and privacy disclosures before public rollout. The existing demo route remains usable. API calls can be subject to provider data-use terms; avoid sensitive inputs. This integration has been syntax checked, not live-tested with your API key.
