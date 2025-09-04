## V&V Diagrams + Parts: What We Built and How It Works

### Goal
Replicate V&V’s model → diagrams → parts experience so that:
- We can search models using partial model numbers
- Select a model to fetch its diagrams (with preview images)
- Select a diagram to preview its image and automatically load the related parts list, including callout item numbers

### Backend (Node/Express, `vandv-app/backend/index.js`)
We added three proxy endpoints that securely pass credentials and forward requests to V&V’s APIs:
- `POST /api/model-search` → `https://soapbeta.streamflow.ca/iplvandv/model-search`
  - Body: `{ modelNumber }`
  - Returns array of models with stable `modelId` used in subsequent calls
- `POST /api/get-diagrams` → `https://soapbeta.streamflow.ca/iplvandv/get-diagrams`
  - Body: `{ modelNumber, modelId }`
  - Returns diagram sections with `diagramId` and small/large image URLs
- `POST /api/get-diagram-parts` → `https://soapbeta.streamflow.ca/iplvandv/get-diagram-parts`
  - Body: `{ modelNumber, modelId, diagramId }`
  - Returns parts keyed by part number; each contains `itemNumber` (the diagram callout), description, price, stock, and product URL

Notes:
- Credentials are kept in the backend and never exposed to the browser.
- Responses are passed through as JSON for the frontend to render.

### Frontend (Vanilla JS)
Files: `vandv-app/frontend/index.html`, `vandv-app/frontend/script.js`, `vandv-app/frontend/style.css`

Key UX:
1) Parts tab (unchanged) to query single part info.
2) Diagrams tab:
   - Enter partial model number → Find Models (auto-fills the first result)
   - Get Diagrams → shows a left grid of diagram cards and a right preview panel
   - Selecting a diagram:
     - Previews the large diagram image
     - Automatically fetches parts for that diagram and renders a table below the image

Important details:
- We removed the manual "Diagram ID" field: selection triggers fetching parts.
- The parts table includes the V&V callout as `Item`, sorted numerically.
- Optional toggle displays raw JSON responses for debugging.

### Why This Matches V&V
- V&V’s site lists number callouts on the image and shows the related parts list underneath. The API gives us the callout numbers (`itemNumber`) but not on-image coordinates. Our UI mirrors the list-under-image pattern using the same data.

### Future Enhancements (High-Level)
- Cache `modelId` per `modelNumber` to reduce API calls
- Export parts as CSV; copy-to-clipboard
- Remember last selected model/diagram in localStorage
- Visual callouts overlay (requires coordinates; not currently provided by API)

### Quick Dev Notes
- Backend port: 3001. Frontend fetches from `http://localhost:3001`
- Start backend: `cd vandv-app/backend && npm start`
- Open `vandv-app/frontend/index.html` in a browser (or serve statically)


