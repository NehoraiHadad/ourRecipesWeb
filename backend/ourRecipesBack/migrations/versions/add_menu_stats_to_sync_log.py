"""Add menu statistics to SyncLog

Revision ID: add_menu_stats_to_sync_log
Revises: add_menu_system
Create Date: 2025-10-22

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_menu_stats_to_sync_log'
down_revision = 'add_menu_system'
branch_labels = None
depends_on = None


def upgrade():
    # Add menu statistics columns to sync_log table
    op.add_column('sync_log', sa.Column('menus_processed', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('sync_log', sa.Column('menus_failed', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('sync_log', sa.Column('menus_added', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('sync_log', sa.Column('menus_updated', sa.Integer(), nullable=True, server_default='0'))


def downgrade():
    # Remove menu statistics columns from sync_log table
    op.drop_column('sync_log', 'menus_updated')
    op.drop_column('sync_log', 'menus_added')
    op.drop_column('sync_log', 'menus_failed')
    op.drop_column('sync_log', 'menus_processed')
