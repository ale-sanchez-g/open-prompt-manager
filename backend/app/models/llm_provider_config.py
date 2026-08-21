from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from app.database.base import Base


class LLMProviderConfig(Base):
    """Stored configuration for a connectable LLM provider (Ollama, OpenAI-compatible, ...)."""

    __tablename__ = 'llm_provider_configs'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    provider_type = Column(String(50), nullable=False)
    base_url = Column(String(500), nullable=False)
    api_key_encrypted = Column(Text, nullable=True)
    default_model = Column(String(255), nullable=True)
    enabled = Column(Integer, default=1)
    cost_per_1k_input_tokens = Column(Float, nullable=True)
    cost_per_1k_output_tokens = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
