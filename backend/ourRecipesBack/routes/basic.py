from flask import Blueprint

basic_bp = Blueprint('basic', __name__)

@basic_bp.route('/ping', methods=['GET'])
def ping():
    """Simple health check endpoint"""
    return {"status": "success", "message": "pong"} 