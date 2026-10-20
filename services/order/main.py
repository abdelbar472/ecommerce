from datetime import datetime
from typing import List
from uuid import uuid4
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, Column, String, Float, DateTime, JSON
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from aiokafka import AIOKafkaProducer

from services.auth.security import get_current_user

# ---------- Kafka ----------
KAFKA_BOOTSTRAP = "localhost:9092"
TOPIC = "order.created"

producer: AIOKafkaProducer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    await producer.start()
    print("✅ Order Service: Kafka producer started")
    yield
    await producer.stop()
    print("Order Service: Kafka producer stopped")


# ---------- Database ----------
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/orders",
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=20,
    pool_timeout=30,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True)
    user_email = Column(String, nullable=False, index=True)
    total = Column(Float, nullable=False)
    items = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Schemas ----------
class OrderItemSchema(BaseModel):
    name: str
    qty: int = Field(gt=0)
    price: float = Field(gt=0)


class CreateOrderRequest(BaseModel):
    user_email: EmailStr
    items: List[OrderItemSchema]


class OrderResponse(BaseModel):
    id: str
    user_email: str
    total: float
    items: List[OrderItemSchema]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- App ----------
app = FastAPI(title="Order Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "service": "order"}


@app.post("/orders", response_model=OrderResponse)
async def create_order(
    payload: CreateOrderRequest,
    user: dict = Depends(get_current_user),
):
    total = sum(item.qty * item.price for item in payload.items)

    order = Order(
        id=str(uuid4()),
        user_email=payload.user_email,
        total=total,
        items=[item.model_dump() for item in payload.items],
    )

    # Persist using a short-lived session so no DB connection is held
    # while awaiting Kafka below (avoids pool exhaustion under load).
    db = SessionLocal()
    try:
        db.add(order)
        db.commit()
        db.refresh(order)
        order_data = {
            "id": order.id,
            "user_email": order.user_email,
            "total": order.total,
            "items": order.items,
            "created_at": order.created_at,
        }
    finally:
        db.close()

    # Publish event to Kafka
    event = {
        "event_id": str(uuid4()),
        "order_id": order_data["id"],
        "user_email": order_data["user_email"],
        "total": order_data["total"],
        "items": order_data["items"],
        "created_at": order_data["created_at"].isoformat(),
    }
    await producer.send_and_wait(TOPIC, event)
    print(f"Published order.created → {order_data['id']}")

    return order_data


@app.get("/orders", response_model=List[OrderResponse])
def list_orders(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return db.query(Order).order_by(Order.created_at.desc()).all()


@app.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order