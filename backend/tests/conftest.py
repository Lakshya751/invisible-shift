import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["AI_PROVIDER"] = "none"  # tests never call a real AI provider


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app import main
    from app.db import Store

    main.set_store(Store("sqlite://"))
    with TestClient(main.app) as c:
        # Same entry point judges use: a guest session with the demo patient.
        r = c.post("/api/demo/launch")
        assert r.status_code == 200
        yield c


@pytest.fixture
def anon():
    """A client with no session."""
    from fastapi.testclient import TestClient

    from app import main
    from app.db import Store

    main.set_store(Store("sqlite://"))
    with TestClient(main.app) as c:
        yield c
