# Prism
## Real-time fake news detection  API for social media for multi-indian languages.

Prism is a high-performance, real-time misinformation and fake news verification engine designed for social media content across multiple Indian languages and English.

It combines multi-stage extraction, neural translation, Google Fact Check Tools API lookups, resilient live web evidence retrieval, and LLM-powered corroboration to provide real-time, explainable truthfulness verdicts with confidence scores.

---

## Key Features

- **Multi-Modal and Social Input**: Supports direct text statements as well as social media URLs from Instagram, facebook, twitter.
- **Multi-Language Detection and Translation**: Automatically detects input languages (Hindi, Tamil, Telugu, Bengali, Marathi, etc.) using `langdetect` and normalizes text to English using Google Neural Machine Translation via `deep-translator`.
- **Claim Extraction**: Isolates core, verifiable factual claims from social noise and rhetoric using Gemini Flash Lite before running verification searches.
- **2-Tier Hybrid Verification Pipeline**:
  1. **Fast Path (Google Fact Check API)**: Instant lookups against indexed professional fact-checking organizations (PIB Fact Check, Vishvas News, BoomLive, The Quint, Alt News, Factly, AFP, etc.).
  2. **Fallback Live Search and Corroboration**: Live web search across authoritative journalistic domains and web sources, followed by LLM-evaluated verdict synthesis (`True`, `False`, or `Unverified` with a 0-100 confidence score).
- **Server-Sent Events (SSE) Streaming**: Low-latency `POST /check/stream` and `POST /api/v1/check/stream` endpoints that yield progressive real-time pipeline events (`content_extracted`, `translated`, `claim_extracted`, `fast_path`, `complete`) to the client.
- **Apple-Inspired Glassmorphic UI**: High-fidelity React and Vite frontend featuring real-time stream progression, Evidence Retrieved drill-down cards with source links, interactive claim inspect drawer, analytics scatter plot, and verification history.
- **Persistent Audit Database**: SQLite (default local) or PostgreSQL database tracking every fact-check, latency metrics, evidence snippets, and extracted metadata.

---

## Architecture

```
User Input (Text / Social URL)
               |
               v
   [Content Extraction] (Instagram / Web Metadata)
               |
               v
   [Language Detection & Translation] (deep-translator)
               |
               v
   [Claim Extraction] (Gemini 2.5 / 3.5 Flash Lite)
               |
               v
   +----------------------------------------------+
   | Fast Path: Google Fact Check Tools API       |
   +----------------------┬-----------------------+
                          |
            Found? -------+------- Not Found?
              |                         |
              v                         v
   [Known Fact Check]         +---------------------------------+
   (Publisher, URL, Rating)   | Fallback: Web Search Engine     |
                              | (Top news & organic articles)   |
                              +----------------┬----------------+
                                               |
                                               v
                                      [Gemini Corroboration]
                                      (Truthfulness & Score)
                                               |
                                               v
                           [Final Verdict & Evidence Payload]
```

---

## Repository Structure

```
Prism/
├── backend/
│   ├── src/backend/
│   │   ├── api/v1/                 # Modular API v1 routers
│   │   ├── core/                   # Configuration, Database engine, Logging
│   │   ├── modules/
│   │   │   ├── factcheck/          # Fact-checking pipeline, services, models, fallback
│   │   │   ├── social/             # Social media content extractors (Instagram)
│   │   │   └── translation/       # Multi-lingual detection & translation
│   │   └── main.py                 # FastAPI application entrypoint & lifespan
│   └── pyproject.toml              # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Verifier page with SSE streaming & Evidence cards
│   │   ├── Dashboard.jsx           # Metrics & history dashboard
│   │   ├── ClaimDetailPanel.jsx    # Evidence drawer & inspector
│   │   ├── ScatterPlotAnalytics.jsx# Truthfulness vs. confidence distribution
│   │   └── main.jsx                # React root
│   └── package.json                # Frontend dependencies
├── test/                           # Backend test suite (pytest)
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** and `npm`
- (Optional) **Google API Key** for Google Fact Check Tools API and Gemini API

---

### 1. Environment Configuration

Copy the example environment template into `.env` at the project root:

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

```env
# Application Environment
ENVIRONMENT=development

# Google API Key (Fact Check Tools API)
GOOGLE_API_KEY=your_google_fact_check_api_key

# Gemini API Key (Claim extraction & fallback corroboration)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite

# Database (Leave as default SQLite or provide PostgreSQL URI)
DATABASE_URL=sqlite:///./prism.db
```

---

### 2. Backend Setup

From the root directory:

```bash
cd backend

# Create virtual environment and activate
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .

# Run the backend server with auto-reload
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend documentation will be accessible at:
- **Interactive OpenAPI Docs**: http://127.0.0.1:8000/docs
- **Health Check**: http://127.0.0.1:8000/api/health

---

### 3. Frontend Setup

In a new terminal window:

```bash
cd frontend

# Install packages
npm install

# Run Vite development server
npm run dev
```

Open http://127.0.0.1:5173 in your browser.

---

## API Reference

### 1. Check Claim (Synchronous)
`POST /check` or `POST /api/v1/check`

**Request Body:**
```json
{
  "text": "Captain Smith fulfilled his duty by handling his aircraft despite difficult circumstances, injury, and pain",
  "url": null
}
```

**Response:**
```json
{
  "state": "True",
  "score": 95,
  "source": "llm_inferred",
  "claim": "Captain Smith handled his aircraft despite difficult circumstances, injury, and pain.",
  "fact_check_results": {
    "evidence": [
      {
        "domain": "gulfnews.com",
        "title": "flydubai incident: Indian Pilot Smit Machchhar Recalls Battling for ...",
        "url": "https://gulfnews.com/...",
        "snippet": "Captain Smit Machchhar recounts his heroic actions..."
      }
    ]
  },
  "timings": {
    "claim_extraction": 1.99,
    "fast_path_lookup": 0.62,
    "fallback_evidence_retrieval": 1.95,
    "fallback_llm_verdict": 2.65,
    "total": 7.26
  }
}
```

---

### 2. Check Claim (Streaming SSE)
`POST /check/stream` or `POST /api/v1/check/stream`

Yields Server-Sent Events (`data: {...}`) detailing each stage:
- `content_extracted`
- `translated`
- `claim_extracted`
- `fast_path_started`
- `fallback_started`
- `complete`

---

### 3. Claims and History
- `GET /claims?limit=50`: List recent claims with evidence and scores.
- `GET /history?limit=50`: Paginated audit history of fact-checks.

---

## Testing

Run backend tests using `pytest`:

```bash
./backend/.venv/bin/python -m pytest test/
```

Run static type verification:

```bash
npx pyright
```

---

## License

This project is licensed under the MIT License.