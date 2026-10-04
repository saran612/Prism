from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.core.config import get_settings

settings = get_settings()

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
SQLITE_CANONICAL_PATH = (BACKEND_DIR / "prism.db").resolve()

db_url = settings.DATABASE_URL
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    db_url = f"sqlite:///{SQLITE_CANONICAL_PATH}"

try:
    engine = create_engine(db_url, connect_args=connect_args)
    if not db_url.startswith("sqlite"):
        with engine.connect() as conn:
            pass
except Exception:
    db_url = f"sqlite:///{SQLITE_CANONICAL_PATH}"
    connect_args = {"check_same_thread": False}
    engine = create_engine(db_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    try:
        from backend.modules.factcheck import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass


init_db()


def get_db():
    init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
