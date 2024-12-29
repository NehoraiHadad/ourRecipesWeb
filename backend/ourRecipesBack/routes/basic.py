from flask import Blueprint
from . import pong

basic_bp = Blueprint('basic', __name__)

@basic_bp.route('/ping', methods=['GET'])
def ping():
    return pong() 