import json
import logging
from typing import List, Dict, Any
from pathlib import Path
from etl.common.context import EtlContext
from etl.common.file import (
    read_text_from_file,
    write_text_to_file,
    ensure_folder_exists,
    get_file_names_in_directory,
)

logger = logging.getLogger(__name__)


class QAObject:
    def __init__(self, summary: str = "", possible_qa: List[Dict[str, Any]] = None):
        self.summary = summary
        self.possible_qa = possible_qa or []

    @classmethod
    def from_json(cls, text: str) -> "QAObject":
        try:
            data = json.loads(text)
            return cls(
                summary=data.get("Summary", ""), possible_qa=data.get("PossibleQA", [])
            )
        except json.JSONDecodeError:
            logger.error("Failed to parse JSON, returning empty QAObject")
            return cls()


class QARoot:
    def __init__(self, groups: List[Dict[str, Any]] = None):
        self.groups = groups or [{"Summary": "", "PossibleQA": []}]

    @classmethod
    def from_json(cls, text: str) -> "QARoot":
        try:
            data = json.loads(text)
            
            # 适配新的数据结构：处理所有类型的QA数据
            all_groups = []
            
            if "content_qa" in data:
                logger.info("Found new data structure with multiple QA types in merge")
                
                # 处理文本内容QA
                content_qa = data.get("content_qa", {})
                content_groups = content_qa.get("Groups", [])
                logger.info(f"Found {len(content_groups)} content groups in merge")
                all_groups.extend(content_groups)
                
                # 处理表格QA
                tables_qa = data.get("tables_qa", [])
                logger.info(f"Found {len(tables_qa)} table groups in merge")
                # 将tables_qa转换为标准的Groups格式
                for table_qa in tables_qa:
                    if "PossibleQA" in table_qa:
                        all_groups.append({
                            "Summary": table_qa.get("Summary", ""),
                            "PossibleQA": table_qa["PossibleQA"]
                        })
                
                # 处理批量图片QA
                images_batch_qa = data.get("images_batch_qa", [])
                logger.info(f"Found {len(images_batch_qa)} image batch groups in merge")
                for image_qa in images_batch_qa:
                    if "PossibleQA" in image_qa:
                        all_groups.append({
                            "Summary": image_qa.get("Summary", ""),
                            "PossibleQA": image_qa["PossibleQA"]
                        })
                
                # 处理单独图片QA
                individual_images_qa = data.get("individual_images_qa", [])
                logger.info(f"Found {len(individual_images_qa)} individual image groups in merge")
                for image_qa in individual_images_qa:
                    if "PossibleQA" in image_qa:
                        all_groups.append({
                            "Summary": image_qa.get("Summary", ""),
                            "PossibleQA": image_qa["PossibleQA"]
                        })
                
                groups = all_groups
            else:
                logger.info("Using legacy data structure in merge, looking for 'Groups' at root level")
                groups = data.get("Groups", [{"Summary": "", "PossibleQA": []}])
            
            return cls(groups=groups)
        except json.JSONDecodeError:
            logger.error("Failed to parse JSON, returning empty QARoot")
            return cls()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "Product": self.product,
            "Url": self.url,
            "Title": self.title,
            "Category": self.category,
            "Groups": self.groups,
        }


def merge_qa_sub(
    text: str, sub_file_list: List[str], doc_object: Dict[str, Any]
) -> QARoot:
    root = QARoot.from_json(text)

    # Set document metadata
    root.product = doc_object["product"]
    root.url = doc_object["url"]
    root.title = doc_object["title"]
    root.category = doc_object["category"]

    for sub_file in sub_file_list:
        filename = Path(sub_file).stem
        _, group_index, qa_index = filename.split("_")
        group_index = int(group_index)
        qa_index = int(qa_index)
        sub_text = read_text_from_file(sub_file)
        sub_qa = QAObject.from_json(sub_text)
        if group_index < len(root.groups) and qa_index < len(
            root.groups[group_index]["PossibleQA"]
        ):
            root.groups[group_index]["PossibleQA"][qa_index]["Sub"] = sub_qa.__dict__
    return root


def get_folder_paths(context: EtlContext) -> Dict[str, Path]:
    root_path = Path(context.root)
    product = context.product
    return {
        "doc": root_path / f"das/.temp/generic_output/{product}",
        "qa": root_path / f"etl_generic/.temp/outputs_generate_qa/{product}",
        "sub": root_path / f"etl_generic/.temp/outputs_generate_qa_sub/{product}",
        "merge": root_path / f"etl_generic/.temp/outputs_merge_qa/{product}",
    }


def start_merge_generic(context: EtlContext) -> None:
    paths = get_folder_paths(context)
    for path in paths.values():
        ensure_folder_exists(str(path))

    file_path = paths["qa"] / f"{context.index}.json"
    if not file_path.exists():
        return

    sub_folder = paths["sub"] / str(context.index)
    sub_file_list = (
        get_file_names_in_directory(str(sub_folder)) if sub_folder.exists() else []
    )

    # Read document metadata
    doc_file_path = paths["doc"] / f"{context.index}.json"
    doc_object = json.loads(read_text_from_file(str(doc_file_path)))

    logger.info(f"Starting merge for generic document {context.index}")
    content = read_text_from_file(str(file_path))
    merged_object = merge_qa_sub(content, sub_file_list, doc_object)
    output_path = paths["merge"] / file_path.name
    write_text_to_file(
        str(output_path), json.dumps(merged_object.to_dict(), ensure_ascii=False)
    )
    logger.info(f"Successfully merged generic document {context.index}")
