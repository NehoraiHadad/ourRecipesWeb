from google_auth_oauthlib.flow import InstalledAppFlow
import os
from datetime import datetime

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata",
    "https://www.googleapis.com/auth/drive"
]

def print_tokens_for_copy(creds):
    """Print tokens in an easy to copy format"""
    print("\n=== New Tokens (Copy these values) ===")
    print("\nGOOGLE_DRIVE_TOKEN=" + creds.token)
    print("\nGOOGLE_DRIVE_REFRESH_TOKEN=" + creds._refresh_token)
    
    # Print expiration information
    print("\n=== Token Information ===")
    if hasattr(creds, 'expiry'):
        expiry = creds.expiry
        print(f"Access Token Expires: {expiry.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Calculate time until expiration
        time_until_expiry = expiry - datetime.now()
        hours = time_until_expiry.total_seconds() / 3600
        print(f"Time until expiration: {hours:.1f} hours")
    else:
        print("Access Token Expiration: Information not available")
        
    print("Refresh Token: Does not expire unless revoked")
    print("\n=====================================")

def main():
    CREDENTIALS_FILE = "google_credentials.json"
    
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"Error: {CREDENTIALS_FILE} not found. Please place the Google credentials file in this directory.")
        exit(1)

    try:
        # Create the flow using client secrets file
        flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)

        # Get credentials
        creds = flow.run_local_server(port=0)

        # Print tokens in easy to copy format
        print_tokens_for_copy(creds)
        
    except Exception as e:
        print(f"Error during token refresh: {str(e)}")

if __name__ == "__main__":
    main() 