import logging
from flask import request
from .logging_service import LoggingService

# Configure logger
logger = logging.getLogger('security')

class SecurityService:
    """Service for handling security headers and CORS"""
    
    @staticmethod
    def setup_security_headers(app):
        """Setup security headers middleware"""
        
        @app.after_request
        def add_security_headers(response):
            """Add security headers to response"""
            origin = request.headers.get('Origin')
            
            # In development, allow direct browser access
            if app.debug and not origin:
                origin = "http://localhost:5000"
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "Development mode: Setting default origin",
                    origin=origin
                )
            
            if origin:
                if app.debug or origin in app.config["CORS_ORIGINS"]:
                    response.headers['Access-Control-Allow-Origin'] = origin
                    response.headers['Access-Control-Allow-Credentials'] = 'true'
                    response.headers['Access-Control-Expose-Headers'] = ', '.join(app.config["CORS_EXPOSE_HEADERS"])
                    
                    if request.method == 'OPTIONS':
                        response.headers['Access-Control-Allow-Methods'] = ', '.join(app.config["CORS_METHODS"])
                        response.headers['Access-Control-Allow-Headers'] = ', '.join(app.config["CORS_ALLOW_HEADERS"])
                        response.headers['Access-Control-Max-Age'] = str(app.config["CORS_MAX_AGE"])
                else:
                    LoggingService.log_with_context(
                        logger,
                        logging.WARNING,
                        "Rejected CORS request from unauthorized origin",
                        origin=origin,
                        allowed_origins=app.config["CORS_ORIGINS"]
                    )
            
            # Ensure HTTPS except in development
            if not app.debug:
                # Allow HTTP for health check endpoint
                if request.path != '/health':
                    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
                    LoggingService.log_with_context(
                        logger,
                        logging.INFO,
                        "Applied HSTS header",
                        path=request.path,
                        max_age=31536000
                    )
            
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
            
            if app.config.get('DEBUG', False):
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "Security headers applied",
                    origin=origin,
                    is_api=request.path.startswith('/api/'),
                    is_options=request.method == 'OPTIONS',
                    headers=dict(response.headers)
                )
            
            return response 