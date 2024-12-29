"""Simplify categories

Revision ID: xxxx
Revises: previous_revision
Create Date: 2024-xx-xx
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Add new categories column to recipes
    op.add_column('recipes', sa.Column('_categories', sa.Text(), nullable=True))
    
    try:
        # Drop foreign key constraint if exists
        op.drop_constraint('recipes_category_id_fkey', 'recipes', type_='foreignkey')
    except:
        pass  # במקרה שה-constraint לא קיים
        
    try:
        # Drop old tables and relationships
        op.drop_table('recipe_categories')
        op.drop_table('category')
    except:
        pass  # במקרה שהטבלאות לא קיימות
    
    try:
        # Drop category_id column if exists
        op.drop_column('recipes', 'category_id')
    except:
        pass

def downgrade():
    # Remove the new categories column
    op.drop_column('recipes', '_categories')
    
    # Add back the old structure
    op.create_table('category',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('recipe_categories',
        sa.Column('recipe_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['category.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('recipe_id', 'category_id')
    )
    
    op.add_column('recipes', sa.Column('category_id', sa.Integer(), nullable=True))
    op.create_foreign_key('recipes_category_id_fkey', 'recipes', 'category', ['category_id'], ['id'])