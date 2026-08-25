"""
Vercel Python Function entry point.

Vercel's Python runtime looks for an ASGI ``app`` in ``api/index.py``; running
locally (``uvicorn main:app``) uses ``main.py`` directly. Both import the same
application object — this file only fixes up ``sys.path`` so the sibling modules
at the project root resolve when Vercel imports this as a top-level module.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402  (path setup must run first)

__all__ = ["app"]
