# Agentic Mapping Studio (Preview → Human Review → Finalize)

This bundle contains:
- **server/** Node/Express backend with `/api/map/preview` and `/api/map/finalize`
- **client/** React (Vite) UI that lets users preview mappings, edit, and finalize download

## Quick start

### 1) Server
```bash
cd server
npm i
cp .env.example .env   # optional, fill AOAI settings
npm start
# server runs on http://localhost:8000
```

### 2) Client
```bash
cd ../client
npm i
npm run dev
# open http://localhost:5173
```

### Using the app
1. Select one or more **.xsd** files and your **.csv/.xlsx** source file.
2. Click **Generate Preview**.
3. Review mappings, adjust target paths (typeahead over all XSD paths), or Skip.
4. Click **Finalize & Download** to receive a ZIP with XLSX + HTML.

> If Azure OpenAI is configured in `.env`, low-confidence columns are refined using the LLM.
> Otherwise, a local similarity matcher is used.
