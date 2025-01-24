from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import pickle
import os

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata",
    "https://www.googleapis.com/auth/drive"
]

def create_folder_and_upload_files(creds):
    """יצירת תיקייה והעלאת קבצים"""
    try:
        # יצירת שירות Drive
        service = build('drive', 'v3', credentials=creds)
        
        print("\nCreating folder...")
        folder_metadata = {
            'name': 'our_recipes',
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(
            body=folder_metadata,
            fields='id'
        ).execute()
        folder_id = folder.get('id')
        print(f"Created folder with ID: {folder_id}")
        
        files_to_upload = [
            'connect_to_our_recipes_channel.session',
            'connect_to_our_recipes_channel_monitor.session',
            '.env'  # הוספת קובץ ה-.env לרשימת הקבצים להעלאה
        ]
        
        file_ids = {}
        
        print("\nUploading files...")
        for filename in files_to_upload:
            if os.path.exists(filename):
                file_metadata = {
                    'name': filename,
                    'parents': [folder_id]
                }
                
                media = MediaFileUpload(
                    filename,
                    mimetype='application/octet-stream',
                    resumable=True
                )
                
                file = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                
                file_ids[filename] = file.get('id')
                print(f"Uploaded {filename} with ID: {file.get('id')}")
            else:
                print(f"Warning: {filename} not found in current directory")
        
        print("\nSummary:")
        print(f"Folder ID: {folder_id}")
        print("File IDs:")
        for name, file_id in file_ids.items():
            print(f"- {name}: {file_id}")
            
        with open('drive_ids.txt', 'w') as f:
            f.write(f"FOLDER_ID={folder_id}\n")
            for name, file_id in file_ids.items():
                if name == '.env':
                    f.write(f"ENV_FILE_ID={file_id}\n")
                elif "monitor" not in name:
                    f.write(f"SESSION_FILE_1_ID={file_id}\n")
                else:
                    f.write(f"SESSION_FILE_2_ID={file_id}\n")
                
        print("\nIDs saved to drive_ids.txt")
        
    except Exception as e:
        print(f"Error: {str(e)}")


CREDENTIALS_FILE = "google_credentials.json"
if not os.path.exists(CREDENTIALS_FILE):
    print(f"Error: {CREDENTIALS_FILE} not found. Please place the Google credentials file in this directory.")
    exit(1)

flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)

# קבל את הcredentials
creds = flow.run_local_server(port=0)

# הדפס את הטוקנים
print("\nTokens:")
print("Access Token:", creds.token)
print("Refresh Token:", creds._refresh_token)

# צור תיקייה והעלה קבצים
create_folder_and_upload_files(creds)
