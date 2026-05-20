"""password_reset_tokens for forgot-password flow.

Revision ID: domain_003
Revises: domain_002
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'domain_003'
down_revision = 'domain_002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'password_reset_tokens' not in tables:
        op.create_table(
            'password_reset_tokens',
            sa.Column('token', sa.Text(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('expires_at', sa.Text(), nullable=False),
            sa.Column('used_at', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('token'),
        )
        op.create_index(
            'ix_password_reset_tokens_user_id',
            'password_reset_tokens',
            ['user_id'],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'password_reset_tokens' in tables:
        op.drop_table('password_reset_tokens')
