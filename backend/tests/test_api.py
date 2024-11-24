import pytest
from unittest.mock import patch
from ourRecipesBack.extensions import db
from ourRecipesBack.models import Recipe
from flask_jwt_extended import create_access_token

@pytest.fixture
def mock_telegram_client():
    """Create a mock for TelegramClient"""
    with patch('telethon.TelegramClient') as mock:
        yield mock

class TestSearchAPI:
    def test_search_empty_query(self, client, auth_cookies):
        """Test search with empty query"""
        client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
        response = client.get('/api/search?query=')
        assert response.status_code == 200
        assert response.get_json() == {}

    @patch('telethon.TelegramClient')
    def test_search_with_local_results(self, mock_client, app, client, auth_cookies):
        """Test search with existing local recipes"""
        # Mock TelegramClient behavior
        mock_client.return_value.__aenter__.return_value.get_messages.return_value = []
        
        with app.app_context():
            # Create test recipes
            recipe1 = Recipe(
                telegram_id=1,
                raw_content="Test chocolate cake recipe",
                title="Chocolate Cake"
            )
            recipe2 = Recipe(
                telegram_id=2,
                raw_content="Test vanilla cake recipe",
                title="Vanilla Cake"
            )
            db.session.add_all([recipe1, recipe2])
            db.session.commit()

            client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
            response = client.get('/api/search?query=cake')
            assert response.status_code == 200
            data = response.get_json()
            assert len(data['results']) == 2
            assert "Chocolate Cake" in [r['title'] for r in data['results'].values()]

class TestSyncAPI:
    def test_sync_unauthorized(self, client):
        """Test sync endpoint without proper authentication"""
        response = client.post('/api/sync')
        assert response.status_code == 401
        assert 'Missing cookie "access_token_cookie"' in response.get_json().get('msg', '')

    def test_sync_guest_user(self, app, client):
        """Test sync endpoint with guest user"""
        with app.app_context():
            guest_token = create_access_token('guest')
            client.set_cookie(key='access_token_cookie', value=guest_token)
            response = client.post('/api/sync')
            assert response.status_code == 403
            assert 'Unauthorized' in response.get_json().get('error', '')