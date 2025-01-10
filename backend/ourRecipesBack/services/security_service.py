import logging
from flask import request

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

class SecurityService:
    """Service for handling security headers and CORS"""
    
    @staticmethod
    def setup_security_headers(app):
        """Setup security headers middleware"""
        
        @app.after_request
        def add_security_headers(response):
            """Add security headers to response"""
            # Debug response headers
            logger.info(f"Response headers before: {dict(response.headers)}")
            
            # Add CORS headers
            origin = request.headers.get('Origin')
            
            # In development, allow direct browser access
            if app.debug and not origin:
                origin = "http://localhost:5000"
                logger.info("Development mode: Setting default origin")
            
            if origin:
                if app.debug or origin in app.config["CORS_ORIGINS"]:
                    response.headers['Access-Control-Allow-Origin'] = origin
                    response.headers['Access-Control-Allow-Credentials'] = 'true'
                    response.headers['Access-Control-Expose-Headers'] = ', '.join(app.config["CORS_EXPOSE_HEADERS"])
                    
                    if request.method == 'OPTIONS':
                        response.headers['Access-Control-Allow-Methods'] = ', '.join(app.config["CORS_METHODS"])
                        response.headers['Access-Control-Allow-Headers'] = ', '.join(app.config["CORS_ALLOW_HEADERS"])
                        response.headers['Access-Control-Max-Age'] = str(app.config["CORS_MAX_AGE"])
            
            # Ensure HTTPS except in development
            if not app.debug:
                # Allow HTTP for health check endpoint
                if request.path != '/health':
                    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            
            # Security headers
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-XSS-Protection'] = '1; mode=block'
            response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
            response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
            
            # Cache control for API
            if request.path.startswith('/api/'):
                response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
                response.headers['Pragma'] = 'no-cache'
                response.headers['Expires'] = '0'
            
            # Add Vary header for proper caching
            response.headers['Vary'] = 'Origin, Accept-Encoding'
            
            # Debug response headers
            logger.info(f"Response headers after: {dict(response.headers)}")
            logger.info(f"Origin header: {origin}")
            logger.info(f"Allowed origins: {app.config['CORS_ORIGINS']}")
            
            return response 