from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, get_jwt, get_jwt_identity, create_access_token, set_access_cookies
from datetime import datetime, timezone, timedelta
from .extensions import db
from .config import config
from .services.auth_service import AuthService, init_cache
from .services.monitoring_service import MonitoringService
from .services.security_service import SecurityService
from .services.google_drive_service import download_session_files
from .background_tasks import start_background_tasks
import logging
import os

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

def create_app(config_name='default'):
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Force development config when running locally
    if app.debug or config_name == 'development':
        config_name = 'development'
        logger.info("Loading development configuration")
    
    # Load configuration
    app.config.from_object(config[config_name])
    logger.info(f"Loaded configuration: {config_name}")
    logger.info(f"CORS Origins: {app.config['CORS_ORIGINS']}")
    
    # Initialize extensions
    db.init_app(app)
    
    # Download session files if needed (only in production)
    if not (app.config['TESTING'] or app.config['DEBUG']):
        logger.info("Production environment detected - checking session files")
        download_session_files(app)
    else:
        logger.info(f"Development/Testing environment detected - skipping session files download")
    
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
            "expose_headers": app.config["CORS_EXPOSE_HEADERS"],
            "methods": app.config["CORS_METHODS"],
            "allow_headers": app.config["CORS_ALLOW_HEADERS"],
            "supports_credentials": app.config["CORS_SUPPORTS_CREDENTIALS"],
            "max_age": app.config["CORS_MAX_AGE"],
            "vary_header": True  # Important for mobile browsers
        }},
        supports_credentials=True
    )
    
    # Setup monitoring and security services
    MonitoringService.setup_monitoring(app)
    SecurityService.setup_security_headers(app)
    
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
    
    # Add health check route that bypasses CORS
    @app.route('/health')
    def health_check():
        """Basic health check for Render"""
        return {"status": "healthy"}, 200
        
    @app.route('/api/session-status')
    def session_status():
        """Detailed check of session files"""
        session_files = [
            'connect_to_our_recipes_channel.session',
            'connect_to_our_recipes_channel_monitor.session'
        ]
        
        status = {'status': 'healthy', 'files': {}}
        
        for filename in session_files:
            path = f'/app/sessions/{filename}'
            if not os.path.exists(path):
                status['files'][filename] = 'missing'
                status['status'] = 'error'
            elif os.path.getsize(path) < 100:
                status['files'][filename] = 'possibly corrupt'
                status['status'] = 'error'
            else:
                status['files'][filename] = 'ok'
                
        return jsonify(status), 200 if status['status'] == 'healthy' else 500
    
    return app
