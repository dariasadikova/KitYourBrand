"""user_sessions, project_reference_images, generation_provider_runs, generation_job_log_entries.

Revision ID: domain_002
Revises: domain_001
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'domain_002'
down_revision = 'domain_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'user_sessions' not in tables:
        op.create_table(
            'user_sessions',
            sa.Column('id', sa.Text(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('expires_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_user_sessions_user_id', 'user_sessions', ['user_id'], unique=False)

    if 'project_reference_images' not in tables:
        op.create_table(
            'project_reference_images',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('project_id', sa.Integer(), nullable=False),
            sa.Column('storage_path', sa.Text(), nullable=False),
            sa.Column('original_filename', sa.Text(), nullable=True),
            sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('project_id', 'storage_path', name='uq_project_reference_images_path'),
        )
        op.create_index(
            'ix_project_reference_images_project_sort',
            'project_reference_images',
            ['project_id', 'sort_order'],
            unique=False,
        )

    if 'generation_provider_runs' not in tables:
        op.create_table(
            'generation_provider_runs',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('job_id', sa.Text(), nullable=False),
            sa.Column('provider', sa.Text(), nullable=False),
            sa.Column('status', sa.Text(), nullable=False),
            sa.Column('started_at', sa.Text(), nullable=True),
            sa.Column('finished_at', sa.Text(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['job_id'], ['generation_jobs_history.job_id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('job_id', 'provider', name='uq_generation_provider_runs_job_provider'),
        )
        op.create_index(
            'ix_generation_provider_runs_job_id',
            'generation_provider_runs',
            ['job_id'],
            unique=False,
        )

    if 'generation_job_log_entries' not in tables:
        op.create_table(
            'generation_job_log_entries',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('job_id', sa.Text(), nullable=False),
            sa.Column('seq', sa.Integer(), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['job_id'], ['generation_jobs_history.job_id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('job_id', 'seq', name='uq_generation_job_log_entries_job_seq'),
        )
        op.create_index(
            'ix_generation_job_log_entries_job_id',
            'generation_job_log_entries',
            ['job_id'],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    for name in (
        'generation_job_log_entries',
        'generation_provider_runs',
        'project_reference_images',
        'user_sessions',
    ):
        if name in tables:
            op.drop_table(name)
