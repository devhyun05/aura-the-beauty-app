# AURA YouTube Reference Workspace

Static internal site for analyzing `https://youtu.be/51N580mF6fE` as a final presentation reference.

## Open

Recommended local server:

```sh
cd /Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/admin/youtube-reference
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173`.

Directly opening `index.html` can work, but the local server path is safer for consistent browser storage behavior.

## Regenerate Automatic Analysis

The page loads `analysis-data.js` first. To rebuild that file from public YouTube metadata:

```sh
cd /Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/admin/youtube-reference
python3 scripts/generate_analysis.py https://youtu.be/51N580mF6fE --out analysis-data.js
```

This fetches public metadata and best-effort captions. If YouTube exposes a caption track but returns an empty timedtext body, the site still generates a metadata-based analysis and clearly marks transcript-level claims as unverified.

## Troubleshooting

- If `python3 .agents/bin/agentctl.py ...` fails from another folder, first move back to the AURA repo or use the absolute path above.
- If the page opens but the YouTube player is black or blocked, use the `YouTube에서 열기` button. The auto analysis notes, timecodes, actions, and export still work locally.
- The small `앱 준비됨` message under the player means JavaScript initialized successfully.

## What It Includes

- YouTube embed and source link
- Video overview and reference purpose
- Presentation design insight board
- Script and message delivery notes
- Content structure analysis
- Timecode notes with YouTube jump links
- Team discussion questions
- Action item checklist
- Automatic metadata-based analysis with manual verification fields when transcript fetching is unavailable

## Data Behavior

Notes are stored only in the current browser with `localStorage`. Use the export button to download a JSON snapshot before switching machines or browsers.

The current template does not claim verified transcript or metadata. Fill in the manual fields during the team review session and mark timecodes as verified only after watching the relevant segment.
