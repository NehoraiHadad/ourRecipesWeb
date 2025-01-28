import logging
import os
import json
import traceback
from datetime import datetime
from logging.handlers import RotatingFileHandler
from flask import request, has_request_context

class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""
    
    def __init__(self, **kwargs):
        super().__init__()
        self.kwargs = kwargs

    def format(self, record):
        json_record = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'module': record.module,
            'function': record.funcName,
            'message': record.getMessage(),
        }
        
        if hasattr(record, 'props'):
            json_record.update(record.props)

        if has_request_context():
            json_record.update({
                'url': request.url,
                'method': request.method,
                'ip': request.remote_addr,
                'user_agent': request.headers.get('User-Agent'),
                'path': request.path
            })

        if record.exc_info:
            json_record['exception'] = {
                'type': str(record.exc_info[0].__name__),
                'message': str(record.exc_info[1]),
                'stacktrace': traceback.format_exception(*record.exc_info)
            }

        return json.dumps(json_record)

class RequestFormatter(logging.Formatter):
    """Custom formatter that includes request information when available"""
    
    def __init__(self, fmt=None, *args, **kwargs):
        self.request_fmt = fmt
        self.default_fmt = '%(asctime)s - %(levelname)s in %(module)s: %(message)s'
        super().__init__(fmt=self.default_fmt, *args, **kwargs)
    
    def format(self, record):
        if has_request_context():
            self._style._fmt = self.request_fmt
            record.url = request.url
            record.remote_addr = request.remote_addr
            record.method = request.method
            record.path = request.path
            record.user_agent = request.headers.get('User-Agent')
        else:
            self._style._fmt = self.default_fmt
        
        return super().format(record)

class LoggingService:
    """Centralized logging configuration service"""
    
    @staticmethod
    def setup_logging(app):
        """Setup application-wide logging configuration"""
        
        # Create logs directory if it doesn't exist
        if not os.path.exists('logs'):
            os.makedirs('logs')
            
        # Configure formatters
        debug_formatter = RequestFormatter(
            '[%(asctime)s] %(remote_addr)s - %(method)s %(url)s\n%(levelname)s in %(module)s: %(message)s\n%(user_agent)s'
        )
        
        prod_formatter = RequestFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

        json_formatter = JSONFormatter()
        
        # Raise logging level for Telethon/MTProto
        telethon_logger = logging.getLogger('telethon')
        telethon_logger.setLevel(logging.INFO)
        mtproto_logger = logging.getLogger('mtprotosender')
        mtproto_logger.setLevel(logging.INFO)
        
        # Adjust Flask/Werkzeug logging levels
        werkzeug_logger = logging.getLogger('werkzeug')
        werkzeug_logger.setLevel(logging.WARNING)
        flask_logger = logging.getLogger('flask.app')
        flask_logger.setLevel(logging.WARNING)
        
        # Suppress python-dotenv tip
        dotenv_logger = logging.getLogger('dotenv')
        dotenv_logger.setLevel(logging.WARNING)
        
        # Setup file handlers
        debug_handler = RotatingFileHandler(
            'logs/debug.log',
            maxBytes=10000000,  # 10MB
            backupCount=5
        )
        debug_handler.setLevel(logging.DEBUG)
        debug_handler.setFormatter(debug_formatter)
        
        error_handler = RotatingFileHandler(
            'logs/error.log',
            maxBytes=10000000,  # 10MB
            backupCount=5
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(prod_formatter)

        # JSON logs for analytics
        json_handler = RotatingFileHandler(
            'logs/analytics.json',
            maxBytes=10000000,  # 10MB
            backupCount=5
        )
        json_handler.setLevel(logging.INFO)
        json_handler.setFormatter(json_formatter)
        
        # Setup console handler
        console_handler = logging.StreamHandler()
        if app.debug:
            console_handler.setLevel(logging.DEBUG)
            console_handler.setFormatter(debug_formatter)
        else:
            console_handler.setLevel(logging.INFO)
            console_handler.setFormatter(prod_formatter)
        
        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG if app.debug else logging.INFO)
        
        # Remove existing handlers
        root_logger.handlers = []
        
        # Add our handlers
        root_logger.addHandler(console_handler)
        root_logger.addHandler(debug_handler)
        root_logger.addHandler(error_handler)
        root_logger.addHandler(json_handler)
        
        # Setup specific loggers with their own handlers
        security_logger = logging.getLogger('security')
        security_logger.setLevel(logging.INFO)
        security_handler = RotatingFileHandler(
            'logs/security.log',
            maxBytes=10000000,
            backupCount=5
        )
        security_handler.setFormatter(prod_formatter)
        security_logger.addHandler(security_handler)
        
        monitoring_logger = logging.getLogger('monitoring')
        monitoring_logger.setLevel(logging.INFO)
        monitoring_handler = RotatingFileHandler(
            'logs/monitoring.log',
            maxBytes=10000000,
            backupCount=5
        )
        monitoring_handler.setFormatter(prod_formatter)
        monitoring_logger.addHandler(monitoring_handler)
        
        # Disable propagation for specific loggers
        security_logger.propagate = False
        monitoring_logger.propagate = False
        
        app.logger.info('Logging setup completed')

    @staticmethod
    def log_with_context(logger, level, message, **kwargs):
        """Helper method to log with additional context"""
        if hasattr(logging, '_levelNames') and level not in logging._levelNames:
            level = logging.INFO
        
        record = logging.LogRecord(
            name=logger.name,
            level=level,
            pathname=__file__,
            lineno=0,
            msg=message,
            args=(),
            exc_info=None
        )
        
        record.props = kwargs
        logger.handle(record) 