"""Add menu system tables

Revision ID: add_menu_system
Create Date: 2025-10-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_menu_system'
down_revision = 'add_sync_fields_to_places'
branch_labels = None
depends_on = None


def upgrade():
    # Create menus table
    op.create_table('menus',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('total_servings', sa.Integer(), nullable=True),
        sa.Column('dietary_type', sa.Enum('MEAT', 'DAIRY', 'PAREVE', name='dietarytype'), nullable=True),
        sa.Column('share_token', sa.String(length=32), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=True),
        sa.Column('ai_reasoning', sa.Text(), nullable=True),
        sa.Column('generation_prompt', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_menus_user_id'), 'menus', ['user_id'], unique=False)
    op.create_index(op.f('ix_menus_share_token'), 'menus', ['share_token'], unique=True)

    # Create menu_meals table
    op.create_table('menu_meals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('menu_id', sa.Integer(), nullable=False),
        sa.Column('meal_type', sa.String(length=100), nullable=False),
        sa.Column('meal_order', sa.Integer(), nullable=False),
        sa.Column('meal_time', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_menu_meal', 'menu_meals', ['menu_id', 'meal_order'], unique=False)

    # Create meal_recipes table
    op.create_table('meal_recipes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('menu_meal_id', sa.Integer(), nullable=False),
        sa.Column('recipe_id', sa.Integer(), nullable=False),
        sa.Column('course_type', sa.String(length=100), nullable=True),
        sa.Column('course_order', sa.Integer(), nullable=True),
        sa.Column('servings', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('ai_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['menu_meal_id'], ['menu_meals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_meal_recipe', 'meal_recipes', ['menu_meal_id', 'recipe_id'], unique=False)

    # Create shopping_list_items table
    op.create_table('shopping_list_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('menu_id', sa.Integer(), nullable=False),
        sa.Column('ingredient_name', sa.String(length=200), nullable=False),
        sa.Column('quantity', sa.String(length=100), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('is_checked', sa.Boolean(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_menu_shopping', 'shopping_list_items', ['menu_id', 'category'], unique=False)


def downgrade():
    # Drop tables in reverse order (due to foreign keys)
    op.drop_index('idx_menu_shopping', table_name='shopping_list_items')
    op.drop_table('shopping_list_items')

    op.drop_index('idx_meal_recipe', table_name='meal_recipes')
    op.drop_table('meal_recipes')

    op.drop_index('idx_menu_meal', table_name='menu_meals')
    op.drop_table('menu_meals')

    op.drop_index(op.f('ix_menus_share_token'), table_name='menus')
    op.drop_index(op.f('ix_menus_user_id'), table_name='menus')
    op.drop_table('menus')
