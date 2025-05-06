# Using Telegram Session Strings

This project has been updated to use Telethon session strings instead of session files. This approach offers several advantages:

1. **Security**: Session strings can be securely stored as environment variables
2. **Portability**: No need to transfer session files between environments
3. **Simplicity**: No complex file synchronization with Google Drive required

## Google Drive Integration Removed

The Google Drive synchronization for session files has been completely removed from the codebase, as it's no longer needed when using session strings. This simplifies the application architecture and reduces dependencies.

## Generating Session Strings

To generate session strings for your Telegram account, use the provided script:

```bash
cd backend
python -m scripts.generate_session_string
```

This script will:
1. Connect to Telegram using your API credentials
2. Authenticate your account
3. Generate a session string
4. Display it in the console

You'll need to store this session string in your environment variables.

## Environment Variables

Add these environment variables to your `.env` file or your environment:

```
# Main session string for the primary channel operations
SESSION_STRING=your_generated_session_string_here

# Optional: Session string for monitor operations (if you use a separate account)
SESSION_STRING_MONITOR=your_monitor_session_string_here

# For development environment
SESSION_STRING_DEV=your_development_session_string_here
SESSION_STRING_MONITOR_DEV=your_development_monitor_session_string_here
```

## Security Warning

Keep your session strings secure. Anyone with access to your session string can use your Telegram account. Never commit these strings to your repository or share them publicly.

## Migrating from Session Files

The system has been designed to gracefully fall back to session files if session strings are not found. This enables a smooth transition period.

To fully migrate:

1. Generate session strings for all required accounts
2. Add them to your environment variables
3. Test that everything works correctly
4. The old session file handling code and Google Drive synchronization have been removed

## In Docker/Deployment Environments

When using containerized environments, make sure to:

1. Add the session strings as environment variables in your docker-compose.yml or deployment configuration
2. The volume mappings for session files have been removed from docker-compose.yml

## Troubleshooting

If you encounter authentication issues:
1. Verify that the session string is correctly copied
2. Try regenerating the session string
3. Check your API credentials (BOT_ID and API_HASH)
4. Monitor logs for Telegram-related errors 