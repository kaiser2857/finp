import json
import logging
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from pathlib import Path
from etl.common.context import EtlContext
from etl.common.file import (
    read_text_from_file,
    write_text_to_file,
    ensure_folder_exists,
    clear_folder,
)
from etl.common.llm import chat_to_llm

logger = logging.getLogger(__name__)


@dataclass
class QAPair:
    question: str
    answer: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "QAPair":
        logger.debug(f"Creating QAPair from data: {data}")
        return cls(question=data.get("Question", ""))


@dataclass
class Chunk:
    possible_qa: List[QAPair]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Chunk":
        logger.debug(f"Creating Chunk from data: {data}")
        possible_qa_data = data.get("PossibleQA", [])
        logger.debug(f"Found {len(possible_qa_data)} possible QA pairs")
        return cls(
            possible_qa=[QAPair.from_dict(qa) for qa in possible_qa_data]
        )


class Document:
    def __init__(self, content_text: str):
        self.content_text = content_text

    @classmethod
    def from_text(cls, text: str) -> "Document":
        return cls(content_text=text)


class FullGenericGenerator:
    PROMPT_TEMPLATE = """基于以下<用户问题>，参考<相关文档>，生成一个最符合用户问题的总结性答案，输出为 markdown 格式的文本。\n## 用户问题\n{question}\n\n## 相关文档\n{content}\n"""

    def __init__(self, context: EtlContext):
        self.context = context
        self.root_path = Path(context.root)
        self.product = context.product
        self.file_index = context.index

    def _generate_answer(self, qa_pair: QAPair, doc_content: str) -> str:
        try:
            prompt = self.PROMPT_TEMPLATE.format(
                question=f"Q：{qa_pair.question}\r\n",
                content=doc_content,
            )
            return chat_to_llm(prompt)
        except Exception as e:
            logger.error(f"Exception occurred while generating answer: {e}")
            return ""

    def _get_file_paths(self) -> tuple[Path, Path, Path]:
        qa_folder = (
            self.root_path / f"etl_generic/.temp/outputs_generate_qa/{self.product}"
        )
        full_folder = (
            self.root_path
            / f"etl_generic/.temp/outputs_generate_qa_full/{self.product}"
        )
        text_folder = self.root_path / f"das/.temp/generic_output/{self.product}"
        return qa_folder, full_folder, text_folder

    def _ensure_directories_exist(self, *paths: Path) -> None:
        for path in paths:
            ensure_folder_exists(str(path))

    def _load_document(self, doc_path: Path) -> Optional[Document]:
        try:
            doc_text = read_text_from_file(str(doc_path))
            return json.loads(doc_text)["content"]
        except Exception as e:
            logger.error(f"Error loading document: {e}")
            return None

    def _load_qa_data(self, qa_path: Path) -> Optional[List[Chunk]]:
        try:
            logger.info(f"Loading QA data from: {qa_path}")
            content = read_text_from_file(str(qa_path))
            logger.info(f"QA file content length: {len(content)} characters")
            
            data = json.loads(content)
            logger.info(f"Parsed JSON data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
            
            # 适配新的数据结构：处理所有类型的QA数据
            all_groups = []
            
            if "content_qa" in data:
                logger.info("Found new data structure with multiple QA types")
                
                # 处理文本内容QA
                content_qa = data.get("content_qa", {})
                content_groups = content_qa.get("Groups", [])
                logger.info(f"Found {len(content_groups)} content groups")
                all_groups.extend(content_groups)
                
                # 处理表格QA
                tables_qa = data.get("tables_qa", [])
                logger.info(f"Found {len(tables_qa)} table groups")
                # 将tables_qa转换为标准的Groups格式
                for table_qa in tables_qa:
                    if "PossibleQA" in table_qa:
                        all_groups.append({
                            "Summary": table_qa.get("Summary", ""),
                            "PossibleQA": table_qa["PossibleQA"]
                        })
                
                # 处理批量图片QA
                images_batch_qa = data.get("images_batch_qa", [])
                logger.info(f"Found {len(images_batch_qa)} image batch groups")
                for image_qa in images_batch_qa:
                    if "PossibleQA" in image_qa:
                        all_groups.append({
                            "Summary": image_qa.get("Summary", ""),
                            "PossibleQA": image_qa["PossibleQA"]
                        })
                
                # 处理单独图片QA
                individual_images_qa = data.get("individual_images_qa", [])
                logger.info(f"Found {len(individual_images_qa)} individual image groups")
                for image_qa in individual_images_qa:
                    if "PossibleQA" in image_qa:
                        all_groups.append({
                            "Summary": image_qa.get("Summary", ""),
                            "PossibleQA": image_qa["PossibleQA"]
                        })
                
                groups = all_groups
            else:
                logger.info("Using legacy data structure, looking for 'Groups' at root level")
                groups = data.get("Groups", [])
            
            logger.info(f"Found {len(groups)} groups in QA data")
            
            if not groups:
                logger.warning("No 'Groups' field found or empty in QA data")
                logger.info(f"Available keys at root: {list(data.keys())}")
                if "content_qa" in data:
                    logger.info(f"Available keys in content_qa: {list(data['content_qa'].keys())}")
                return []
            
            chunks = [Chunk.from_dict(chunk) for chunk in groups]
            logger.info(f"Successfully created {len(chunks)} chunks")
            return chunks
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in QA data: {e}")
            logger.error(f"Content that failed to parse: {content[:1000] if 'content' in locals() else 'No content'}")
            return None
        except Exception as e:
            logger.error(f"Error loading QA data: {e}")
            if 'content' in locals():
                logger.error(f"Content that caused error: {content[:1000]}")
            return None

    def _save_answer(
        self, answer: str, output_path: Path, chunk_index: int, qa_index: int
    ) -> None:
        try:
            write_text_to_file(str(output_path), answer)
        except Exception as e:
            logger.error(f"Error saving answer: {e}")

    def generate(self) -> None:
        qa_folder, full_folder, text_folder = self._get_file_paths()
        self._ensure_directories_exist(qa_folder, full_folder, text_folder)
        qa_path = qa_folder / f"{self.file_index}.json"
        doc_path = text_folder / f"{self.file_index}.json"
        logger.info(f"QA Path: {qa_path}, Doc Path: {doc_path}")
        if not qa_path.exists() or not doc_path.exists():
            return
        doc_content = self._load_document(doc_path)
        if not doc_content:
            return
        logger.info("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        chunks = self._load_qa_data(qa_path)
        logger.info(f"Chunks result: {chunks}")
        logger.info(f"Chunks type: {type(chunks)}")
        logger.info(f"Chunks is None: {chunks is None}")
        logger.info(f"Chunks length: {len(chunks) if chunks else 'N/A'}")
        if chunks:
            logger.info(f"First chunk content: {chunks[0]}")
        if not chunks:
            return
        logger.info(f"Loaded {len(chunks)} chunks for file index {self.file_index}")
        full_folder_path = full_folder / str(self.file_index)
        clear_folder(str(full_folder_path))
        logger.info(f"generate_full----{self.file_index}")
        for chunk_index, chunk in enumerate(chunks):
            for qa_index, qa_pair in enumerate(chunk.possible_qa):
                logger.info(
                    f"--{self.file_index}_{chunk_index}_{qa_index}_{qa_pair.question}"
                )
                answer = self._generate_answer(qa_pair, doc_content)
                output_path = (
                    full_folder_path / f"{self.file_index}_{chunk_index}_{qa_index}.md"
                )
                self._save_answer(answer, output_path, chunk_index, qa_index)


def start_generate_full_generic(context: EtlContext) -> None:
    generator = FullGenericGenerator(context)
    generator.generate()
