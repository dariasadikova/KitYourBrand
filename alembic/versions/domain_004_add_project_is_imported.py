"""projects.is_imported flag for imported external projects.

Revision ID: domain_004
Revises: domain_003
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'domain_004'
down_revision = 'domain_003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'projects' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('projects')}
    if 'is_imported' not in cols:
        with op.batch_alter_table('projects') as batch_op:
            batch_op.add_column(
                sa.Column('is_imported', sa.Integer(), nullable=False, server_default=sa.text('0')),
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'projects' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('projects')}
    if 'is_imported' in cols:
        with op.batch_alter_table('projects') as batch_op:
            batch_op.drop_column('is_imported')
