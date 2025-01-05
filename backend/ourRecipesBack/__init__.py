from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager, get_jwt, get_jwt_identity, create_access_token, set_access_cookies
from datetime import datetime, timezone, timedelta
from .extensions import db
from .config import config
from .services.auth_service import AuthService, init_cache
from .background_tasks import start_background_tasks

def create_app(config_name='default'):
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    
    # Initialize JWT first
    jwt = JWTManager(app)
    
    # Setup JWT handlers
    AuthService.setup_jwt_handlers(jwt)
    
    # Initialize CORS after JWT
    CORS(
        app,
        resources={r"/*": {
            "origins": app.config["CORS_ORIGINS"],
            "allow_credentials": True,
            "expose_headers": ["Set-Cookie", "Authorization"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
            "supports_credentials": True,
            "max_age": 120  # Cache preflight requests for 2 minutes
        }},
        supports_credentials=True
    )
    
    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.recipes import recipes_bp
    from .routes.categories import categories_bp
    from .routes.versions import versions_bp
    from .routes.sync import sync_bp
    from .routes.basic import basic_bp
    from .routes.places import places
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(recipes_bp, url_prefix='/api/recipes')
    app.register_blueprint(categories_bp, url_prefix='/api/categories')
    app.register_blueprint(versions_bp, url_prefix='/api/versions')
    app.register_blueprint(sync_bp, url_prefix='/api/sync')
    app.register_blueprint(basic_bp, url_prefix='/api')
    app.register_blueprint(places, url_prefix='/api/places')
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
    init_cache(app)
    
    @app.after_request
    def refresh_expiring_jwts(response):
        try:
            exp_timestamp = get_jwt()["exp"]
            now = datetime.now(timezone.utc)
            target_timestamp = datetime.timestamp(now + timedelta(minutes=30))
            if target_timestamp > exp_timestamp:
                access_token = create_access_token(identity=get_jwt_identity())
                set_access_cookies(response, access_token)
            return response
        except (RuntimeError, KeyError):
            return response

    # Start background tasks if not in testing mode
    if not app.config['TESTING']:
        start_background_tasks(app)
    
    return app
