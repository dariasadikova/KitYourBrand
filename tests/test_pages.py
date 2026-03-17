from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_landing_page() -> None:
    response = client.get('/')
    assert response.status_code == 200
    assert 'Создайте бренд-стиль за минуты' in response.text


def test_register_get() -> None:
    response = client.get('/register')
    assert response.status_code == 200
    assert 'Регистрация' in response.text


def test_register_post_success() -> None:
    response = client.post(
        '/register',
        data={
            'name': 'Test User',
            'email': 'test_user_unique@example.com',
            'password': 'strongpass123',
            'password_confirm': 'strongpass123',
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers['location'] == '/register?success=1'
