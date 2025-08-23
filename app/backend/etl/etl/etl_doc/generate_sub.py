import json
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

from etl.common.context import EtlContext
from etl.common.file import (
    read_text_from_file,
    write_text_to_file,
    ensure_folder_exists,
    clear_folder,
)
from etl.common.format import extract_qa_object
from etl.common.llm import chat_to_llm

# Configure logging
logger = logging.getLogger(__name__)

# Constants
PROMPT_TEMPLATE = """
## instruction
我在构建一个检索系统，需要对用户问题进行增强（Augmentation），先总结并提炼，然后针对不同的角度各生成一个相似的问题及其答案，使用中文回答。

## output schema
始终以如下JSON格式返回：{"Summary":"string","PossibleQA":[{"Question":"string","Answer":"string"}]}。  

## 增强方法
同义词扩展和替换、问题重述、问题细化、反向问题、语法变化、拼写校正、上下文增强、文档摘要生成等。  

## 要处理的文档
{{Content}}
"""


class QAObject:
    def __init__(self, question: str, answer: str):
        self.question = question
        self.answer = answer

    def to_content(self) -> str:
        return f"Q：{self.question}\r\nA：{self.answer}\r\n"


def load_object(text: str) -> Dict[str, Any]:
    """Load and parse JSON content from text."""
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {e}")
        raise


def generate_qa_enhancement(
    qa_obj: Dict[str, str], prompt_template: str
) -> Optional[Dict[str, Any]]:
    """Generate enhanced QA pairs using LLM."""
    try:
        qa_content = QAObject(
            question=qa_obj.get("Question", ""), answer=qa_obj.get("Answer", "")
        ).to_content()

        prompt = prompt_template.replace("{{Content}}", qa_content)
        response = chat_to_llm(prompt)
        return extract_qa_object(response)
    except Exception as e:
        logger.error(f"Error generating QA enhancement: {e}")
        return None


def process_qa_group(
    groups: List[Dict[str, Any]],
    file_index: int,
    output_path: Path,
    prompt_template: str,
) -> None:
    """Process a group of QA pairs and generate enhanced versions."""
    for chunk_index, chunk in enumerate(groups):
        for qa_index, qa in enumerate(chunk["PossibleQA"]):
            logger.info(
                f"Processing QA pair: {file_index}_{chunk_index}_{qa_index}_{qa['Question']}"
            )

            response = generate_qa_enhancement(qa, prompt_template)
            if not response:
                continue

            output_file = output_path / f"{file_index}_{chunk_index}_{qa_index}.json"
            write_text_to_file(
                str(output_file), json.dumps(response, ensure_ascii=False)
            )


def start_generate_sub_doc(context: EtlContext) -> None:
    """Main function to generate enhanced QA documents."""
    try:
        # Setup paths
        root_path = Path(context.root)
        product = context.product
        file_index = context.index

        input_folder = root_path / f"etl_doc/.temp/outputs_generate_qa/{product}"
        output_folder = root_path / f"etl_doc/.temp/outputs_generate_qa_sub/{product}"
        input_file = input_folder / f"{file_index}.json"

        # Ensure directories exist
        ensure_folder_exists(input_folder)
        ensure_folder_exists(output_folder)

        # Clear and create output subfolder
        sub_output_folder = output_folder / str(file_index)
        clear_folder(sub_output_folder)

        if not input_file.exists():
            logger.warning(f"Input file not found: {input_file}")
            return

        # Process the input file
        logger.info(f"Starting generation for file: {file_index}")
        content = read_text_from_file(str(input_file))
        generation_object = load_object(content)

        process_qa_group(
            groups=generation_object["Groups"],
            file_index=file_index,
            output_path=sub_output_folder,
            prompt_template=PROMPT_TEMPLATE,
        )

    except Exception as e:
        logger.error(f"Error in start_generate_sub_doc: {e}")
        raise
