"""Добавляет пользовательские API-ключи провайдеров.

Revision ID: user_api_keys_001
Revises: domain_001
Create Date: 2026-05-12

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'user_api_keys_001'
down_revision = 'domain_001'
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table_name not in set(insp.get_table_names()):
        return set()
    return {column['name'] for column in insp.get_columns(table_name)}


def upgrade() -> None:
    columns = _column_names('users')
    if not columns:
        return
    if 'recraft_api_key' not in columns:
        op.add_column('users', sa.Column('recraft_api_key', sa.Text(), nullable=True))
    if 'openrouter_api_key' not in columns:
        op.add_column('users', sa.Column('openrouter_api_key', sa.Text(), nullable=True))


def downgrade() -> None:
    columns = _column_names('users')
    if 'openrouter_api_key' in columns:
        op.drop_column('users', 'openrouter_api_key')
    if 'recraft_api_key' in columns:
        op.drop_column('users', 'recraft_api_key')
