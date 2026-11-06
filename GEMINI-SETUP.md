# Gemini + Google Sheets Setup

Everything in Google ecosystem — Gemini API for chat, Google Sheets for transcript storage.

## Option 1: Test with Mock Responses (Right Now)

No API key needed. Just rename and run:

## Step 1: Create Folder Structure

```
diary-study-portal/
├── server-mock.js
├── .env-mock
├── package-mock.json
└── public/
    └── index.html
```

## Step 2: Rename Files

```bash
# Rename files
mv server-gemini.js server.js
mv .env-gemini .env
mv package-gemini.json package.json

# Install and run
npm install
npm start
```

Visit `http://localhost:3000` — uses mock responses.

---

## Option 2: Use Real Gemini API

### Step 1: Get Gemini API Key

1. Go to https://ai.google.dev/
2. Click "Get API Key"
3. Create a new API key in Google Cloud Console
4. Copy the key

### Step 2: Update `.env`

```
GEMINI_API_KEY=your_actual_gemini_key_here
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEETS_CREDENTIALS=your_credentials_json_here
PORT=3000
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start Server

```bash
npm start
```

Server will use real Gemini API now. You should see:

```
🤖 Mode: GEMINI API (real responses)
```

---

## Google Sheets Setup (Optional but Recommended)

To auto-save transcripts to Google Sheets:

1. Create a Google Sheet
2. Set up a free Google Cloud service account (see GOOGLE-SHEETS-SETUP.md)
3. Share the sheet with the service account email
4. Add credentials to `.env`

Then transcripts auto-save to your sheet!

---

## Troubleshooting

| Issue                        | Fix                                             |
| ---------------------------- | ----------------------------------------------- |
| "GEMINI_API_KEY not set"     | Leave it blank—server uses mock mode            |
| Gemini responses not working | Check your API key is valid                     |
| Google Sheets not saving     | Check `GOOGLE_SHEET_ID` and credentials are set |
| "Module not found"           | Run `npm install` after renaming files          |

---

## Switching Back to Claude

If you want to use Claude Anthropic instead:

1. Replace `server.js` with the Claude version
2. Add `ANTHROPIC_API_KEY` to `.env`
3. Restart

Easy swap!

---

## Current Status

- ✓ Mock mode works (no keys needed)
- ✓ Google Sheets ready (optional)
- ⬜ Gemini API (add key when ready)

Enjoy!
