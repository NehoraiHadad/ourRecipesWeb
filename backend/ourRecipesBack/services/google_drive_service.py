from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
from google.auth.transport.requests import Request
import logging
import os
import io
from datetime import datetime

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

def test_drive_upload(app):
    """Test Drive access by creating and uploading a test file"""
    try:
        app.logger.info("Testing Drive upload capability...")
        creds = Credentials.from_authorized_user_info(
            info={
                "token": os.getenv("GOOGLE_DRIVE_TOKEN"),
                "refresh_token": os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN"),
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET")
            }
        )
        
        if creds.expired:
            app.logger.warning("Token is expired, attempting to refresh...")
            creds.refresh(Request())
            app.logger.info("Token refreshed successfully")
            
        service = build('drive', 'v3', credentials=creds)
        
        # Create a test file
        file_metadata = {
            'name': 'test_file.txt',
            'mimeType': 'text/plain'
        }
        
        # Create temporary file
        temp_file = '/tmp/test_file.txt'
        with open(temp_file, 'w') as f:
            f.write("This is a test file to verify Drive access")
        
        # Upload the file
        media = MediaFileUpload(
            temp_file,
            mimetype='text/plain',
            resumable=True
        )
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        # Clean up
        os.remove(temp_file)
        
        app.logger.info(f"Test file uploaded successfully with ID: {file.get('id')}")
        return True
        
    except Exception as e:
        app.logger.error(f"Drive upload test failed: {str(e)}")
        return False

def validate_google_drive_access(app):
    """Validate Google Drive access and token validity"""
    try:
        app.logger.info("Validating Google Drive access...")
        creds = Credentials.from_authorized_user_info(
            info={
                "token": os.getenv("GOOGLE_DRIVE_TOKEN"),
                "refresh_token": os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN"),
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET")
            }
        )
        
        # Check if token needs refresh
        if creds.expired:
            app.logger.warning("Token is expired, attempting to refresh...")
            creds.refresh(Request())
            app.logger.info("Token refreshed successfully")
            
        service = build('drive', 'v3', credentials=creds)
        
        # Check API access and permissions
        app.logger.info("Checking Drive API access...")
        try:
            # Try to list files (this will fail if we don't have proper access)
            results = service.files().list(pageSize=1).execute()
            app.logger.info("Successfully accessed Drive API")
            
            # Get user permissions
            about = service.about().get(fields="user").execute()
            app.logger.info(f"Authenticated as: {about.get('user', {}).get('emailAddress', 'Unknown')}")
            
        except Exception as api_error:
            app.logger.error(f"Drive API access error: {str(api_error)}")
            return False
            
        # Search for session files directly
        app.logger.info("Listing all files in Drive first...")
        all_files_results = service.files().list(
            pageSize=1000,
            fields="files(id, name, mimeType, owners, parents, trashed)",
            q="trashed = false",  # Only non-trashed files
            orderBy="name"
        ).execute()
        
        all_files = all_files_results.get('files', [])
        if all_files:
            app.logger.info("\n=== All Files in Drive ===")
            for file in all_files:
                owner = file.get('owners', [{}])[0].get('emailAddress', 'Unknown')
                file_type = "📁" if file['mimeType'] == 'application/vnd.google-apps.folder' else "📄"
                app.logger.info(f"{file_type} {file['name']} (ID: {file['id']}, Owner: {owner})")
        else:
            app.logger.error("No files found in Drive at all!")
            return False
            
        # Now search for our session files with multiple patterns
        app.logger.info("\nSearching for session files...")
        session_patterns = [
            'connect_to_our_recipes_channel',
            'channel.session',
            'monitor',
            '.session'
        ]
        
        found_files = []
        for file in all_files:
            name = file['name'].lower()
            if any(pattern.lower() in name for pattern in session_patterns):
                found_files.append(file)
                
        if found_files:
            app.logger.info("\n=== Found Potential Session Files ===")
            for file in found_files:
                owner = file.get('owners', [{}])[0].get('emailAddress', 'Unknown')
                app.logger.info(f"- {file['name']} (ID: {file['id']}, Owner: {owner})")
                
                # Update environment variables with correct file IDs
                if 'monitor' in file['name'].lower():
                    os.environ['SESSION_FILE_2_ID'] = file['id']
                    app.logger.info(f"Updated SESSION_FILE_2_ID to {file['id']}")
                elif 'channel.session' in file['name'].lower() or ('connect' in file['name'].lower() and '.session' in file['name'].lower()):
                    os.environ['SESSION_FILE_1_ID'] = file['id']
                    app.logger.info(f"Updated SESSION_FILE_1_ID to {file['id']}")
            
            # Verify we found both files
            if os.getenv('SESSION_FILE_1_ID') and os.getenv('SESSION_FILE_2_ID'):
                app.logger.info("✅ Found both session files successfully")
                return True
            else:
                app.logger.error("❌ Could not find all required session files")
                if not os.getenv('SESSION_FILE_1_ID'):
                    app.logger.error("Missing: connect_to_our_recipes_channel.session")
                if not os.getenv('SESSION_FILE_2_ID'):
                    app.logger.error("Missing: connect_to_our_recipes_channel_monitor.session")
                return False
        else:
            app.logger.error("No session files found in Drive")
            return False
        
    except Exception as e:
        app.logger.error(f"Google Drive validation failed: {str(e)}")
        return False

def download_session_files(app):
    """Download session files from Google Drive if they don't exist locally"""
    # First validate Google Drive access and update file IDs
    if not validate_google_drive_access(app):
        raise RuntimeError("Failed to validate Google Drive access")
        
    # Ensure sessions directory exists
    sessions_dir = '/app/sessions'
    if not os.path.exists(sessions_dir):
        app.logger.info(f"Creating sessions directory at {sessions_dir}")
        try:
            os.makedirs(sessions_dir)
        except Exception as e:
            app.logger.error(f"Failed to create sessions directory: {str(e)}")
            # Try alternative location
            sessions_dir = os.path.join(os.getcwd(), 'sessions')
            app.logger.info(f"Trying alternative location: {sessions_dir}")
            os.makedirs(sessions_dir, exist_ok=True)
    
    app.logger.info(f"Using sessions directory: {sessions_dir}")
        
    session_files = {
        'connect_to_our_recipes_channel.session': os.getenv('SESSION_FILE_1_ID'),
        'connect_to_our_recipes_channel_monitor.session': os.getenv('SESSION_FILE_2_ID')
    }
    
    for filename, file_id in session_files.items():
        if not file_id:
            app.logger.error(f"No file ID found for {filename}")
            continue
            
        session_path = os.path.join(sessions_dir, filename)
        app.logger.info(f"Session file path: {session_path}")
        
        # Skip if file exists
        if os.path.exists(session_path):
            app.logger.info(f"Session file {filename} already exists")
            # Log file size and last modified time
            file_size = os.path.getsize(session_path)
            file_mtime = datetime.fromtimestamp(os.path.getmtime(session_path))
            app.logger.info(f"File size: {file_size} bytes")
            app.logger.info(f"Last modified: {file_mtime}")
            continue
            
        try:
            app.logger.info(f"Downloading session file {filename} (ID: {file_id})")
            # Setup Google Drive client
            creds = Credentials.from_authorized_user_info(
                info={
                    "token": os.getenv("GOOGLE_DRIVE_TOKEN"),
                    "refresh_token": os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN"),
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET")
                }
            )
            
            # Refresh token if needed
            if creds.expired:
                app.logger.info("Token expired, refreshing...")
                creds.refresh(Request())
                app.logger.info("Token refreshed successfully")
                
            service = build('drive', 'v3', credentials=creds)
            
            # Download session file
            request = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                if status:
                    app.logger.info(f"Download {int(status.progress() * 100)}%")
                    
            # Save the file
            fh.seek(0)
            with open(session_path, 'wb') as f:
                f.write(fh.read())
                f.flush()
                os.fsync(f.fileno())
                
            app.logger.info(f"Successfully downloaded {filename}")
            
        except Exception as e:
            app.logger.error(f"Failed to download {filename}: {str(e)}")
            raise 