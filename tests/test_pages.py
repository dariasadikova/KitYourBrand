from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_landing_page_loads() -> None:
    response = client.get('/')
    assert response.status_code == 200
    assert 'Создайте бренд-стиль'.encode('utf-8') in response.content
