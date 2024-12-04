from datetime import datetime, timezone
import pytest
from ourRecipesBack.models import Recipe, RecipeVersion, db
import time

def test_create_version(test_client, init_database, auth_cookies):
    """Test creating a new version"""
    recipe = init_database
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    
    version_data = {
        "content": {
            "title": "עוגת שוקולד",
            "raw_content": "מתכון לעוגת שוקולד",
            "categories": [],
            "ingredients": ["קמח", "סוכר", "שוקולד"],
            "instructions": "לערבב הכל"
        },
        "change_description": "גרסה חדשה"
    }
    
    response = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions',
        json=version_data,
        headers={'Content-Type': 'application/json'}
    )

    assert response.status_code == 200
    versions = response.get_json()
    assert isinstance(versions, list)
    assert len(versions) > 0
    latest_version = versions[0]
    assert latest_version['version_num'] == 2
    assert latest_version['content']['title'] == version_data['content']['title']
    assert latest_version['is_current'] == True

def test_get_versions(test_client, init_database, auth_cookies):
    """Test retrieving versions of a recipe"""
    recipe = Recipe.query.first()
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    response = test_client.get(f'/api/recipes/{recipe.telegram_id}/versions')
    
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    if len(data) > 0:
        assert all(
            'id' in version and 
            'version_num' in version and 
            'content' in version and 
            'created_at' in version
            for version in data
        )

def test_restore_version(test_client, init_database, auth_cookies):
    """Test restoring a previous version"""
    recipe = init_database
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    
    # Create a new version first
    version_data = {
        "content": {
            "title": "עוגת שוקולד מעולה",
            "raw_content": "מתכון משופר לעוגת שוקולד",
            "categories": ["קינוחים", "אפייה"],
            "ingredients": ["קמח", "סוכר", "שוקולד מריר"],
            "instructions": "לערבב היטב"
        },
        "change_description": "גרסה חדשה"
    }
    
    # Create new version
    response = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions',
        json=version_data,
        headers={'Content-Type': 'application/json'}
    )
    assert response.status_code == 200
    
    # Get versions and try to restore the first one
    response = test_client.get(f'/api/recipes/{recipe.telegram_id}/versions')
    assert response.status_code == 200
    versions = response.get_json()
    assert len(versions) > 0
    first_version_id = versions[-1]['id']  # Get the oldest version
    
    # Try to restore
    response = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions/{first_version_id}/restore',
        headers={'Content-Type': 'application/json'}
    )
    
    assert response.status_code == 200
    data = response.get_json()
    assert 'message' in data
    assert 'recipe' in data

def test_version_ordering(test_client, init_database, auth_cookies):
    """Test that versions are returned in correct order"""
    recipe = init_database
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    response = test_client.get(f'/api/recipes/{recipe.telegram_id}/versions')
    
    assert response.status_code == 200
    data = response.get_json()
    if len(data) > 1:
        dates = [datetime.fromisoformat(v['created_at']) for v in data]
        assert all(dates[i] >= dates[i+1] for i in range(len(dates)-1))

def test_invalid_version_restore(test_client, init_database, auth_cookies):
    """Test attempting to restore an invalid version"""
    recipe = Recipe.query.first()
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    invalid_version_id = 99999
    
    response = test_client.post(
        f'/api/recipes/{recipe.id}/versions/{invalid_version_id}/restore'
    )
    
    assert response.status_code == 404 

def test_version_with_image(test_client, init_database, auth_cookies):
    """Test version creation with image data"""
    recipe = init_database
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    image_data = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    
    version_data = {
        "content": {
            "title": "עוגת שוקולד",
            "raw_content": "מתכון עם תמונה",
            "categories": [],
            "ingredients": [],
            "instructions": "",
            "image": image_data
        },
        "change_description": "הוספת תמונה"
    }
    
    response = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions',
        json=version_data,
        headers={'Content-Type': 'application/json'}
    )
    
    assert response.status_code == 200
    versions = response.get_json()
    assert len(versions) > 0
    latest_version = versions[0]
    assert 'image' in latest_version
    assert latest_version['image'] is not None

def test_concurrent_version_creation(test_client, init_database, auth_cookies):
    """Test handling concurrent version creation"""
    recipe = init_database
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    
    version_data1 = {
        "content": {
            "title": "גרסה 1",
            "raw_content": "תוכן 1",
            "categories": [],
            "ingredients": [],
            "instructions": ""
        },
        "change_description": "גרסה 1"
    }
    
    version_data2 = {
        "content": {
            "title": "גרסה 2",
            "raw_content": "תוכן 2",
            "categories": [],
            "ingredients": [],
            "instructions": ""
        },
        "change_description": "גרסה 2"
    }
    
    response1 = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions',
        json=version_data1,
        headers={'Content-Type': 'application/json'}
    )
    
    response2 = test_client.post(
        f'/api/recipes/{recipe.telegram_id}/versions',
        json=version_data2,
        headers={'Content-Type': 'application/json'}
    )
    
    assert response1.status_code == 200
    assert response2.status_code == 200

def test_version_cleanup(test_client, init_database, auth_cookies):
    """Test cleanup of old versions"""
    recipe = Recipe.query.first()
    test_client.set_cookie(key='access_token_cookie', value=auth_cookies['access_token_cookie'])
    
    # Get initial state
    initial_response = test_client.get(f'/api/recipes/{recipe.telegram_id}/versions')
    initial_data = initial_response.get_json()
    initial_count = len(initial_data)
    
    # Create multiple versions (more than the limit)
    for i in range(5):  # יוצרים 5 גרסאות חדשות
        version_data = {
            "content": {
                "title": f"גרסה {i}",
                "raw_content": f"תוכן {i}",
                "categories": ["קטגוריה"],
                "ingredients": [f"מצרך {j}" for j in range(3)],
                "instructions": f"הוראות הכנה {i}"
            },
            "change_description": f"גרסה {i}"
        }
        response = test_client.post(
            f'/api/recipes/{recipe.telegram_id}/versions',
            json=version_data,
            headers={'Content-Type': 'application/json'}
        )
        assert response.status_code == 200
    
    response = test_client.get(f'/api/recipes/{recipe.telegram_id}/versions')
    data = response.get_json()
    
    # בדיקות
    assert len(data) == 3  # בדיקה שנשמרות בדיוק 3 הגרסאות האחרונות
    assert data[0]['version_num'] > data[-1]['version_num']  # בדיקה שהגרסאות מסודרות מהחדשה לישנה
    
    # בדיקה שהגרסאות האחרונות נשמרו
    versions = [v['content']['title'] for v in data]
    assert "גרסה 4" in versions  # הגרסה האחרונה שנוצרה
    assert "גרסה 3" in versions  # הגרסה הלפני אחרונה
    assert "גרסה 2" in versions  # הגרסה השלישית מהסוף
    
    # בדיקה שהגרסאות הישנות נמחקו
    for i in range(2):  # בדיקת הגרסאות הישנות
        assert f"גרסה {i}" not in versions
    assert initial_data[0]['content']['title'] not in versions  # בדיקה שהגרסה הראשונית נמחקה