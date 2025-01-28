import logging
from datetime import datetime, timezone
from flask import request
from .logging_service import LoggingService

# Configure logger
logger = logging.getLogger('monitoring')

class MonitoringService:
    """Service for monitoring and device detection"""
    
    @staticmethod
    def setup_monitoring(app):
        """Setup monitoring middleware"""
        
        @app.before_request
        def debug_cors():
            """Log CORS-related information"""
            if app.config.get('DEBUG', False):
                # Only log detailed CORS info in debug mode
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "CORS Request received",
                    method=request.method,
                    origin=request.headers.get('Origin'),
                    path=request.path
                )
            
            # Only warn about insecure requests for non-health check paths
            if not request.is_secure and request.path != '/health':
                LoggingService.log_with_context(
                    logger,
                    logging.WARNING,
                    "Insecure request detected",
                    scheme=request.scheme,
                    path=request.path
                )

            if request.method == 'OPTIONS' and app.config.get('DEBUG', False):
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "Preflight request details",
                    method=request.headers.get('Access-Control-Request-Method'),
                    headers=request.headers.get('Access-Control-Request-Headers')
                )

        @app.before_request
        def handle_mobile_requests():
            """Handle mobile and Safari requests"""
            user_agent = request.headers.get('User-Agent', '').lower()
            is_mobile = any(device in user_agent for device in ['iphone', 'ipad', 'android', 'mobile'])
            is_safari = 'safari' in user_agent and 'chrome' not in user_agent
            
            if is_mobile or is_safari:
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "Mobile/Safari client detected",
                    is_mobile=is_mobile,
                    is_safari=is_safari,
                    user_agent=user_agent
                )
                # Set appropriate cookie settings for mobile/Safari
                app.config['JWT_COOKIE_SAMESITE'] = 'None'
                app.config['SESSION_COOKIE_SAMESITE'] = 'None'
                app.config['JWT_COOKIE_SECURE'] = True
                app.config['SESSION_COOKIE_SECURE'] = True

        @app.before_request
        def verify_cookies():
            """Verify and log cookie information"""
            if app.config.get('DEBUG', False):
                LoggingService.log_with_context(
                    logger,
                    logging.DEBUG,
                    "Cookie verification",
                    cookies_present=bool(request.cookies),
                    cookie_count=len(request.cookies)
                )
            
            # Check if we're in development and using HTTP
            if app.config['DEBUG'] and request.scheme == 'http':
                LoggingService.log_with_context(
                    logger,
                    logging.INFO,
                    "Development mode HTTP request",
                    scheme=request.scheme,
                    path=request.path
                )
                return
                
            # For production, ensure HTTPS
            cf_visitor = request.headers.get('Cf-Visitor', '')
            is_cloudflare_https = False
            try:
                if cf_visitor and ':' in cf_visitor:
                    scheme = cf_visitor.strip('{}').replace('"', '').split(':')[1].strip()
                    is_cloudflare_https = scheme == 'https'
            except Exception as e:
                LoggingService.log_with_context(
                    logger,
                    logging.ERROR,
                    "Failed to parse Cf-Visitor header",
                    error=str(e),
                    header_value=cf_visitor,
                    exc_info=True
                )
            
            is_https = (
                request.scheme == 'https' or
                request.headers.get('X-Forwarded-Proto') == 'https' or
                is_cloudflare_https
            )
            
            if not app.config['DEBUG'] and not is_https and request.path != '/health':
                LoggingService.log_with_context(
                    logger,
                    logging.ERROR,
                    "Security violation: Non-HTTPS request",
                    path=request.path,
                    scheme=request.scheme,
                    headers=dict(request.headers)
                )
                return {"error": "HTTPS required"}, 403 