from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os


from etl.routers.das import das_router
from etl.routers.etl import etl_router
from etl.routers.file_status import file_status_router
from etl.routers.publish import publish_router
from etl.routers.config import config_router
from etl.routers.log import log_router
# from etl.routers.knowledge_graph import router as knowledge_graph_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(das_router)
app.include_router(etl_router)
app.include_router(file_status_router)
app.include_router(publish_router)
app.include_router(config_router)
app.include_router(log_router)
# app.include_router(knowledge_graph_router, prefix="/knowledge-graph", tags=["知识图谱"])

# --- Static files ---

# Mount static files
static_path = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "etlapp-web", "dist"
)
if os.path.exists(static_path):
    # Mount assets directory separately to handle JS/CSS files
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(static_path, "assets")),
        name="assets",
    )
    # Mount root path for HTML files
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
