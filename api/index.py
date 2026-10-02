import sys
import os

# Add backend/src to path for Vercel Serverless Function execution
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_src = os.path.join(current_dir, "..", "backend", "src")
if os.path.exists(backend_src) and backend_src not in sys.path:
    sys.path.insert(0, backend_src)

from backend.main import app

# Expose app instance for Vercel ASGI runner
handler = app
