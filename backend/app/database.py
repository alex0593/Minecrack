from sqlmodel import Session, SQLModel, create_engine

from .settings import settings


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


async def get_session():
    with Session(engine) as session:
        yield session
