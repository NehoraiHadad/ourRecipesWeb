import pytest
from datetime import datetime
from ourRecipesBack.models import Recipe, Category
from ourRecipesBack.extensions import db

@pytest.fixture
def auth_token(client):
    """Create and return auth token for testing"""
    response = client.post('/api/auth/login', json={
        'username': 'test-user',
        'password': 'test-password'
    })
    return response.json['access_token']

def test_get_categories(client, auth_cookies):
    """Test getting categories endpoint"""
    # Create test recipes with categories
    recipes = [
        Recipe(
            telegram_id=1,
            title="Test Recipe 1",
            raw_content="כותרת: מתכון 1\nקטגוריות: קינוחים, עוגות\nמצרכים:\n- סוכר",
        ),
        Recipe(
            telegram_id=2,
            title="Test Recipe 2",
            raw_content="כותרת: מתכון 2\nקטגוריות: בשרי, מרקים\nמצרכים:\n- בשר",
        ),
    ]
    
    db.session.add_all(recipes)
    db.session.commit()

    # Test the endpoint
    client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    response = client.get('/api/categories')
    
    assert response.status_code == 200
    data = response.get_json()
    assert 'categories' in data
    assert set(data['categories']) == {'קינוחים', 'עוגות', 'בשרי', 'מרקים'}

def test_search_with_categories(client, auth_cookies):
    """Test search endpoint with category filtering"""
    # Create test recipes
    recipes = [
        Recipe(
            telegram_id=1,
            title="עוגת שוקולד",
            raw_content="כותרת: עוגת שוקולד\nקטגוריות: קינוחים, עוגות\nמצרכים:\n- שוקולד",
        ),
        Recipe(
            telegram_id=2,
            title="מרק עוף",
            raw_content="כותרת: מרק עוף\nקטגוריות: מרקים, בשרי\nמצרכים:\n- עוף",
        ),
    ]
    
    db.session.add_all(recipes)
    db.session.commit()

    # Test search with category filter
    client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    response = client.get('/api/search?categories=קינוחים')
    
    assert response.status_code == 200
    data = response.get_json()
    assert len(data['results']) == 1
    assert 'עוגת שוקולד' in data['results']['1']['title']

def test_category_model(app):
    """Test Category model functionality"""
    with app.app_context():
        # Create parent category
        parent = Category(name='מאפים')
        db.session.add(parent)
        db.session.commit()
        
        # Set initial path and level for parent
        parent.update_path()  # קודם מעדכנים את ה-parent
        db.session.commit()

        # Create child category
        child = Category(name='עוגות', parent_id=parent.id)
        db.session.add(child)
        db.session.commit()
        
        # Now update child's path
        child.parent = parent  # וודא שה-relationship מוגדר
        child.update_path()
        db.session.commit()

        assert parent.level == 0
        assert parent.path == 'מאפים'
        assert child.level == 1
        assert child.path == 'מאפים/עוגות'

def test_recipe_category_parsing():
    """Test recipe category parsing functionality"""
    recipe = Recipe(
        telegram_id=1,
        title="Test Recipe",
        raw_content="כותרת: מתכון\nקטגוריות: קינוחים, עוגות\nמצרכים:\n- סוכר"
    )
    
    # Test category extraction
    categories = []
    recipe_parts = recipe.raw_content.split('\n')
    for part in recipe_parts:
        if part.strip().startswith('קטגוריות:'):
            categories = part.replace('קטגוריות:', '').split(',')
            categories = [cat.strip() for cat in categories if cat.strip()]
    
    assert set(categories) == {'קינוחים', 'עוגות'} 