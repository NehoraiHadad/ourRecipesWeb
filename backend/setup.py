from setuptools import setup, find_packages

setup(
    name="ourRecipesBack",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        'flask',
        'flask-cors',
        'telethon',
        'flask-jwt-extended',
        'openai',
        'requests',
        'google-genai',
        'flask-sqlalchemy',
    ],
) 