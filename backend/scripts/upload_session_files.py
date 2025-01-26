from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import os
from dotenv import load_dotenv
from pathlib import Path

# Get the absolute path to the backend directory and env file
BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / '.env'

# Load environment variables
if not ENV_FILE.exists():
    print(f"Error: {ENV_FILE} not found")
    exit(1)

load_dotenv(ENV_FILE)

# Validate required environment variables
required_vars = [
    'GOOGLE_DRIVE_TOKEN',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_FILE_1_ID',
    'SESSION_FILE_2_ID'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    print("Error: Missing required environment variables:")
    for var in missing_vars:
        print(f"- {var}")
    exit(1)

def upload_files():
    """Upload session files using existing credentials"""
    try:
        # Create credentials from existing tokens
        creds = Credentials(
            token=os.getenv('GOOGLE_DRIVE_TOKEN'),
            refresh_token=os.getenv('GOOGLE_DRIVE_REFRESH_TOKEN'),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.getenv('GOOGLE_CLIENT_ID'),
            client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
            scopes=["https://www.googleapis.com/auth/drive.file"]
        )

        # Create Drive service
        service = build('drive', 'v3', credentials=creds)
        
        # Files to upload with their corresponding file IDs from env
        files_to_upload = {
            'connect_to_our_recipes_channel.session': os.getenv('SESSION_FILE_1_ID'),
            'connect_to_our_recipes_channel_monitor.session': os.getenv('SESSION_FILE_2_ID')
        }
        
        print("\nUploading files...")
        for filename, file_id in files_to_upload.items():
            if not file_id:
                print(f"Error: No file ID found for {filename}")
                continue
                
            if not os.path.exists(filename):
                print(f"Warning: {filename} not found in current directory")
                continue
            
            try:
                # Update existing file
                media = MediaFileUpload(
                    filename,
                    mimetype='application/octet-stream',
                    resumable=True
                )
                
                file = service.files().update(
                    fileId=file_id,
                    media_body=media
                ).execute()
                
                print(f"Successfully updated {filename}")
                
            except Exception as e:
                print(f"Error updating {filename}: {str(e)}")
        
        print("\nUpload complete!")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == '__main__':
    upload_files() 