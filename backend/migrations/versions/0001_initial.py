"""Initial Minecrack ecosystem schema."""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("mod", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("slug", sa.String(100), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("author", sa.String(160), nullable=False), sa.Column("source_url", sa.String(500)), sa.Column("description", sa.String(), nullable=False), sa.UniqueConstraint("slug"))
    op.create_index("ix_mod_slug", "mod", ["slug"])
    op.create_table("modpack", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("slug", sa.String(100), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.String(), nullable=False), sa.Column("active_release_id", sa.Integer()), sa.UniqueConstraint("slug"))
    op.create_index("ix_modpack_slug", "modpack", ["slug"])
    op.create_table("modversion", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("mod_id", sa.Integer(), sa.ForeignKey("mod.id"), nullable=False), sa.Column("version_string", sa.String(100), nullable=False), sa.Column("minecraft_version", sa.String(40), nullable=False), sa.Column("loader", sa.String(30), nullable=False), sa.Column("file_name", sa.String(255), nullable=False), sa.Column("sha256", sa.String(64), nullable=False), sa.Column("file_size_bytes", sa.BigInteger(), nullable=False), sa.Column("storage_key", sa.String(255), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("sha256", name="uq_modversion_sha256"))
    op.create_index("ix_modversion_mod_id", "modversion", ["mod_id"])
    op.create_index("ix_modversion_sha256", "modversion", ["sha256"])
    op.create_table("modpackrelease", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("modpack_id", sa.Integer(), sa.ForeignKey("modpack.id"), nullable=False), sa.Column("version_string", sa.String(100), nullable=False), sa.Column("minecraft_version", sa.String(40), nullable=False), sa.Column("loader", sa.String(30), nullable=False), sa.Column("changelog", sa.String(), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("published_at", sa.DateTime(timezone=True)), sa.UniqueConstraint("modpack_id", "version_string", name="uq_modpack_release_version"))
    op.create_index("ix_modpackrelease_modpack_id", "modpackrelease", ["modpack_id"])
    op.create_index("ix_modpackrelease_status", "modpackrelease", ["status"])
    op.create_foreign_key("fk_modpack_active_release", "modpack", "modpackrelease", ["active_release_id"], ["id"])
    op.create_table("releasefile", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("release_id", sa.Integer(), sa.ForeignKey("modpackrelease.id"), nullable=False), sa.Column("mod_version_id", sa.Integer(), sa.ForeignKey("modversion.id"), nullable=False), sa.Column("file_name", sa.String(255), nullable=False), sa.UniqueConstraint("release_id", "file_name", name="uq_release_filename"))
    op.create_index("ix_releasefile_release_id", "releasefile", ["release_id"])
    op.create_index("ix_releasefile_mod_version_id", "releasefile", ["mod_version_id"])


def downgrade():
    op.drop_table("releasefile")
    op.drop_constraint("fk_modpack_active_release", "modpack", type_="foreignkey")
    op.drop_table("modpackrelease")
    op.drop_table("modversion")
    op.drop_table("modpack")
    op.drop_table("mod")

