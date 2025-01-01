"""add sync fields to places

Revision ID: add_sync_fields_to_places
Revises: add_places_table
Create Date: 2024-01-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_sync_fields_to_places'
down_revision = 'add_places_table'
branch_labels = None
depends_on = None

def upgrade():
    # Add sync-related columns to places table
    op.add_column('places', sa.Column('is_synced', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('places', sa.Column('last_sync_at', sa.DateTime(), nullable=True))

def downgrade():
    # Remove sync-related columns from places table
    op.drop_column('places', 'last_sync_at')
    op.drop_column('places', 'is_synced') 