"""Configuration des tests : base en mémoire, administrateur et démonstration, pas de signal SAWALI."""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongomock://")
os.environ.setdefault("PRESENCE_SAWALI", "0")
os.environ.setdefault("ADMIN_EMAIL", "admin@test.bf")
os.environ.setdefault("ADMIN_MOT_DE_PASSE", "admin-test-123")
os.environ.setdefault("SEED_DEMO", "1")
os.environ.setdefault("DEMO_MOT_DE_PASSE", "demo-test-123")
os.environ.setdefault("JWT_SECRET", "secret-de-test")
os.environ.setdefault("OSRM_URL", "http://127.0.0.1:9")   # aucun appel réseau : estimation de secours
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
