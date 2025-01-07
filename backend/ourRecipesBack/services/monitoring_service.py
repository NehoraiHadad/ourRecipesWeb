import logging
from datetime import datetime, timezone
from flask import request

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

class MonitoringService:
    """Service for monitoring and device detection"""
    
    @staticmethod
    def setup_monitoring(app):
        """Setup monitoring middleware"""
        
        @app.before_request
        def debug_cors():
            """Log CORS-related information"""
            logger.info(f"Request method: {request.method}")
            logger.info(f"Request origin: {request.headers.get('Origin')}")
            logger.info(f"Request path: {request.path}")
            if request.method == 'OPTIONS':
                logger.info("Handling preflight request")
                logger.info(f"Access-Control-Request-Method: {request.headers.get('Access-Control-Request-Method')}")
                logger.info(f"Access-Control-Request-Headers: {request.headers.get('Access-Control-Request-Headers')}")

        @app.before_request
        def handle_mobile_requests():
            """Handle mobile and Safari requests"""
            user_agent = request.headers.get('User-Agent', '').lower()
            is_mobile = any(device in user_agent for device in ['iphone', 'ipad', 'android', 'mobile'])
            is_safari = 'safari' in user_agent and 'chrome' not in user_agent
            
            if is_mobile or is_safari:
                logger.info(f"Mobile/Safari request detected: UA={user_agent}, Mobile={is_mobile}, Safari={is_safari}")
            
            # Set appropriate cookie settings for mobile/Safari
            if is_mobile or is_safari:
                app.config['JWT_COOKIE_SAMESITE'] = 'None'
                app.config['SESSION_COOKIE_SAMESITE'] = 'None'
                app.config['JWT_COOKIE_SECURE'] = True
                app.config['SESSION_COOKIE_SECURE'] = True

        @app.before_request
        def verify_cookies():
            """Verify and log cookie information"""
            logger.info(f"Request cookies: {request.cookies}")
            logger.info(f"Request headers: {dict(request.headers)}")
            
            # Check if we're in development and using HTTP
            if app.config['DEBUG'] and request.scheme == 'http':
                logger.warning("Running in development mode with HTTP")
                return
                
            # For production, ensure HTTPS
            if not app.config['DEBUG'] and request.scheme != 'https':
                logger.warning(f"Insecure request detected: {request.scheme}")
                return {"error": "HTTPS required"}, 403 