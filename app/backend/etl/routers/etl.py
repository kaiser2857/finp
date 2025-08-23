from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
import os
import threading
import time
from etl.common.config import app_config
from etl.common.file import read_text_from_file

etl_router = APIRouter(prefix="/api")

etl_progress_status = {}


def etl_process_single_file(product: str, etl_type: str, filename: str):
    """Process a single file with ETL for the given product."""
    from etl.common.context import EtlContext
    from etl.etl.flow import etl_generic_full_flow, start_generate_full_generic
    from etl.etl.etl_generic.generate import start_generate_generic
    from etl.etl.etl_generic.merge import start_merge_generic
    from etl.etl.etl_generic.embedding import start_embedding_generic

    # Remove file extension to get the base filename
    file_base = os.path.splitext(filename)[0]

    # Create ETL context for the specific file
    context = EtlContext(
        root_path=app_config.root_path,
        doc_type="generic",
        product=product,
        index=file_base,
    )

    # Choose the appropriate processing function based on etl_type
    if etl_type == "qa":
        # QA generation only
        start_generate_generic(context)
    elif etl_type == "embedding":
        # Full embedding flow (generate, merge, embedding)
        start_merge_generic(context)
        start_embedding_generic(context)
    elif etl_type == "full":
        # Full answer generation
        # start_generate_full_generic(context)
        etl_generic_full_flow(context)
    else:
        raise ValueError(f"Unknown etl_type: {etl_type}")


@etl_router.post("/etl_start")
def etl_start_execution(
    product: str = Form(...),
    etl_type: str = Form(...),  # embedding, qa, full
    filename: str = Form(...),
):
    # 检查配置完整性
    config_errors = []

    # 检查LLM配置
    if not app_config.llm.api_key:
        config_errors.append("LLM API密钥未配置")
    if not app_config.llm.api_base:
        config_errors.append("LLM API基础地址未配置")
    if not app_config.llm.model_name:
        config_errors.append("LLM模型名称未配置")

    # 检查Embedding配置
    if not app_config.embedding.api_key:
        config_errors.append("Embedding API密钥未配置")

    # 如果有配置错误，返回错误信息
    if config_errors:
        return JSONResponse(
            status_code=400, content={"error": "配置不完整", "details": config_errors}
        )

    task_id = f"etl_{product}_{etl_type}_{filename}_{int(time.time())}"
    etl_progress_status[task_id] = {"status": "running", "progress": 0, "msg": ""}

    def run_etl_task():
        try:
            etl_progress_status[task_id]["msg"] = (
                f"ETL-{etl_type} started for {filename}"
            )
            etl_process_single_file(product, etl_type, filename)
            etl_progress_status[task_id]["status"] = "done"
            etl_progress_status[task_id]["progress"] = 100
            etl_progress_status[task_id]["msg"] = (
                f"ETL-{etl_type} finished for {filename}"
            )
        except Exception as e:
            etl_progress_status[task_id]["status"] = "error"
            etl_progress_status[task_id]["msg"] = str(e)

    threading.Thread(target=run_etl_task, daemon=True).start()
    return {"task_id": task_id}


@etl_router.get("/etl_progress")
def etl_get_progress(task_id: str):
    if task_id not in etl_progress_status:
        return JSONResponse(status_code=404, content={"error": "Task not found"})
    return etl_progress_status[task_id]


@etl_router.get("/etl_result_content")
def etl_get_result_content(product: str, etl_type: str, filename: str):
    if etl_type == "embedding":
        output_dir = os.path.join(
            app_config.root_path, f"etl_generic/.temp/outputs_embedding/{product}"
        )
    elif etl_type == "qa":
        output_dir = os.path.join(
            app_config.root_path, f"etl_generic/.temp/outputs_generate_qa/{product}"
        )
    elif etl_type == "full":
        output_dir = os.path.join(
            app_config.root_path,
            f"etl_generic/.temp/outputs_generate_qa_full/{product}",
        )
    else:
        return JSONResponse(status_code=400, content={"error": "Unknown etl_type"})

    file_path = os.path.join(output_dir, filename)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})

    return read_text_from_file(file_path)
