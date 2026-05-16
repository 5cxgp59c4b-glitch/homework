from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )

# ---- モデル ----

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: Optional[str] = "todo"
    priority: Optional[str] = "medium"
    due_date: Optional[str] = None
    category: Optional[str] = ""
    tags: Optional[list[str]] = []
    recurring: Optional[bool] = False
    recurrence_type: Optional[str] = "weekly"
    recurrence_interval: Optional[int] = 1

class TaskUpdate(TaskCreate):
    pass

# ---- 課題 ----

@app.get("/tasks")
def get_tasks():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM tasks ORDER BY created_at DESC")
    tasks = cur.fetchall()
    cur.close()
    conn.close()
    return tasks

@app.post("/tasks")
def create_task(task: TaskCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO tasks (title, description, status, priority, due_date, category, tags,
                           recurring, recurrence_type, recurrence_interval)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """, (
        task.title, task.description, task.status, task.priority,
        task.due_date or None, task.category, task.tags,
        task.recurring, task.recurrence_type, task.recurrence_interval
    ))
    new_task = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_task

@app.put("/tasks/{task_id}")
def update_task(task_id: str, task: TaskUpdate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE tasks SET
            title=%s, description=%s, status=%s, priority=%s, due_date=%s,
            category=%s, tags=%s, recurring=%s, recurrence_type=%s, recurrence_interval=%s
        WHERE id=%s RETURNING *
    """, (
        task.title, task.description, task.status, task.priority,
        task.due_date or None, task.category, task.tags,
        task.recurring, task.recurrence_type, task.recurrence_interval,
        task_id
    ))
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated

@app.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id=%s RETURNING id", (task_id,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}

# ---- カテゴリ ----

@app.get("/categories")
def get_categories():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM categories ORDER BY name")
    categories = cur.fetchall()
    cur.close()
    conn.close()
    return categories

@app.post("/categories")
def create_category(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("INSERT INTO categories (name) VALUES (%s) RETURNING *", (name,))
    new_cat = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_cat

@app.delete("/categories/{name}")
def delete_category(name: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE tasks SET category='' WHERE category=%s", (name,))
    cur.execute("DELETE FROM categories WHERE name=%s RETURNING name", (name,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}
