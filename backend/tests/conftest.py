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
        yield c
