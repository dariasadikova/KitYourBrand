"""Добавляет пользовательские Yandex Cloud credentials для Alice AI ART.

Revision ID: user_api_keys_002
Revises: user_api_keys_001
Create Date: 2026-06-06

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'user_api_keys_002'
down_revision = 'user_api_keys_001'
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
    if 'yandex_cloud_api_key' not in columns:
        op.add_column('users', sa.Column('yandex_cloud_api_key', sa.Text(), nullable=True))
    if 'yandex_cloud_folder' not in columns:
        op.add_column('users', sa.Column('yandex_cloud_folder', sa.Text(), nullable=True))


def downgrade() -> None:
    columns = _column_names('users')
    if 'yandex_cloud_folder' in columns:
        op.drop_column('users', 'yandex_cloud_folder')
    if 'yandex_cloud_api_key' in columns:
        op.drop_column('users', 'yandex_cloud_api_key')
