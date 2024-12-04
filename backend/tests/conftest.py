import pytest
import asyncio
from ourRecipesBack import create_app
from ourRecipesBack.extensions import db
from ourRecipesBack.models import Recipe, RecipeVersion
from flask_jwt_extended import create_access_token

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "asyncio: mark test as async"
    )

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()

@pytest.fixture(scope='function')
def app():
    """Create application for testing"""
    test_config = {
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'SESSION_NAME': 'test_session',
        'BOT_ID': 'test_bot_id',
        'API_HASH': 'test_api_hash',
        'CHANNEL_URL': 'test_channel',
        'OLD_CHANNEL_URL': 'test_old_channel',
        'ORIGIN_CORS': ['http://localhost:3000'],
        'SECRET_JWT': 'test-secret',
        'JWT_SECRET_KEY': 'test-jwt-secret',
        'SECRET_KEY': 'test-secret-key'
    }
    
    app = create_app(test_config)
    
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def access_token(app):
    with app.app_context():
        return create_access_token('test-user')

@pytest.fixture
def auth_cookies(access_token):
    return {
        'access_token_cookie': access_token
    }

@pytest.fixture(autouse=True)
def cleanup_database(app):
    """Clean up database after each test"""
    with app.app_context():
        db.session.remove()
        db.drop_all()
        db.create_all()
        yield
        db.session.remove()
        db.drop_all()

@pytest.fixture
def test_client(app):
    return app.test_client()

@pytest.fixture
def init_database():
    """Initialize test database with a recipe"""
    recipe = Recipe(
        telegram_id=12345,
        title="Test Recipe",
        raw_content="Test content"
    )
    db.session.add(recipe)
    db.session.commit()
    
    # Create initial version
    version = RecipeVersion(
        recipe_id=recipe.id,
        content={
            "title": recipe.title,
            "raw_content": recipe.raw_content,
            "categories": [],
            "ingredients": [],
            "instructions": ""
        },
        created_by="test_user",
        change_description="Initial version"
    )
    db.session.add(version)
    db.session.commit()
    
    return recipe