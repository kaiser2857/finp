import os
import json
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from etl.common.chunk import split_text_into_sentence_groups
from etl.common.context import EtlContext
from etl.common.file import (
    read_text_from_file,
    write_text_to_file,
    ensure_folder_exists,
)
from etl.common.format import extract_qa_object
from etl.common.llm import chat_to_llm, chat_to_llm_with_messages, chat_to_mutil_model, chat_to_mutil_model_with_messages

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class PromptConfig:
    # 原有的文本处理模板
    single_group_template: str = """## instruction\n我在构建一个检索系统，需要提取下面文档中的知识点，文档为通用文本，需要总结并提炼，然后针对不同的角度各生成一个相似的问题及其答案，问题需要在源文档中找到答案，问题不少于{{QA_Count}}个，使用中文回答。\n\n## output schema\n始终以如下JSON格式返回：{"Summary":"string","PossibleQA":[{"Question":"string","Answer":"string"}]}。  \n\n## 要处理的文档\n{{Content}}\n"""
    multi_group_template1: str = (
        """请记住下面的文本内容，它将对你后续要做的任务有帮助。\n{{Content_Full}}\n"""
    )
    multi_group_template2: str = """## instruction\n我在构建一个知识检索系统，需要提取下面文本片段中的知识点，需要先总结并提炼片段部分的概要，然后针对片段内不同的知识点各生成一个相关的问题及其答案，问题需要在源文档中找到答案，问题不少于{{QA_Count}}个，使用中文回答。\n\n## 输出格式\n始终直接以如下JSON格式返回：{"Summary":"string","PossibleQA":[{"Question":"string","Answer":"string"}]}。  \n\n## 文本片段\n{{Content_Chunk}}\n"""
    assistant_response: str = "好的，我将在后续任务参考上述文本。请告诉我你的具体任务。"
    
    # 表格处理专用模板
    table_template: str = """## instruction\n我在构建一个知识检索系统，需要从下面的表格中提取关键信息和知识点,我会给你一个json格式的表格信息，其中可能有多个表也可能只有一个。请分析表格的结构、数据内容和含义，然后生成相关的问题和答案。问题应该涵盖表格的不同方面：数据查询、趋势分析、比较分析、统计信息等，问题不少于{{QA_Count}}个，使用中文回答。\n\n## output schema\n始终以如下JSON格式返回：{"Summary":"string","TableAnalysis":"string","PossibleQA":[{"Question":"string","Answer":"string","QueryType":"string"}]}。\n\n## 表格内容（Markdown格式）\n{{TableContent}}\n"""
    
    # 图片处理专用模板（多模态）
    image_template: str = """## instruction\n我在构建一个知识检索系统，需要从提供的图片中提取视觉信息和知识点。请仔细观察图片内容，识别图片类型（图表、截图、示意图等），分析图片中的关键信息，然后生成相关的问题和答案。问题应该涵盖图片的不同方面：内容描述、数据读取、流程分析、元素识别等，问题不少于{{QA_Count}}个，使用中文回答。\n\n## output schema\n始终以如下JSON格式返回：{"Summary":"string","ImageDescription":"string","ImageType":"string","PossibleQA":[{"Question":"string","Answer":"string","QueryType":"string"}]}。\n\n## 图片信息\n图片文件路径：{{ImagePath}}\n图片文件名：{{ImageName}}\n"""
    
    # 图片批量处理模板
    images_batch_template: str = """## instruction\n我在构建一个知识检索系统，文档中包含多张图片。请基于图片的整体信息生成相关的问题和答案。问题应该涵盖：图片数量、图片类型分布、图片与文档的关系等，问题不少于{{QA_Count}}个，使用中文回答。\n\n## output schema\n始终以如下JSON格式返回：{"Summary":"string","ImagesSummary":"string","PossibleQA":[{"Question":"string","Answer":"string","QueryType":"string"}]}。\n\n## 图片信息\n图片总数：{{ImageCount}}\n图片文件夹：{{ImagesFolder}}\n图片文件列表：{{ImagesList}}\n"""

class QAGenerator:
    def __init__(self, prompt_config: Optional[PromptConfig] = None):
        self.prompt_config = prompt_config or PromptConfig()

    def _generate_single_qa(self, prompt: str) -> Dict[str, Any]:
        try:
            response = chat_to_llm(prompt)
            return extract_qa_object(response)
        except Exception as e:
            logger.error(f"Error generating QA: {e}")
            return {"Summary": "", "PossibleQA": []}

    def _generate_multi_qa(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        try:
            response = chat_to_llm_with_messages(messages)
            return extract_qa_object(response)
        except Exception as e:
            logger.error(f"Error generating QA: {e}")
            return {"Summary": "", "PossibleQA": []}

    def _generate_image_qa(self, prompt: str, image_path: str) -> Dict[str, Any]:
        try:
            logger.info(f"Generating image QA for: {image_path}")
            response = chat_to_mutil_model(prompt)
            return extract_qa_object(response)
        except Exception as e:
            logger.error(f"Error generating image QA: {e}")
            return {"Summary": "", "ImageDescription": "", "ImageType": "", "PossibleQA": []}

    def generate_by_single_group(
        self, main_content: str, group: List[str]
    ) -> Dict[str, Any]:
        sentence_length = len(group)
        prompt = self.prompt_config.single_group_template.replace(
            "{{QA_Count}}", str(sentence_length)
        ).replace("{{Content}}", main_content)
        qa_object = self._generate_single_qa(prompt)
        return {"Groups": [qa_object]}

    def generate_by_groups(
        self, main_content: str, groups: List[List[str]]
    ) -> Dict[str, Any]:
        objects = []
        for group in groups:
            sentence_length = len(group)
            sentence_text = "。".join(group)
            messages = [
                {"role": "system", "content": "你是一个乐于解答各种问题的助手。"},
                {
                    "role": "user",
                    "content": self.prompt_config.multi_group_template1.replace(
                        "{{Content_Full}}", main_content
                    ),
                },
                {"role": "assistant", "content": self.prompt_config.assistant_response},
                {
                    "role": "user",
                    "content": self.prompt_config.multi_group_template2.replace(
                        "{{QA_Count}}", str(sentence_length)
                    ).replace("{{Content_Chunk}}", sentence_text),
                },
            ]
            qa_object = self._generate_multi_qa(messages)
            objects.append(qa_object)
        return {"Groups": objects}

    def generate_table_qa(self, table_content) -> Dict[str, Any]:
        try:
            qa_count = max(3, min(len(table_content), 8))
            
            prompt = self.prompt_config.table_template.replace(
                "{{QA_Count}}", str(qa_count)
            ).replace("{{TableContent}}", table_content)
            
            result = self._generate_single_qa(prompt)
            # result["table_content"] = table_content
            # result["table_format"] = "json"
            
            return result
        except Exception as e:
            logger.error(f"Error generating markdown table QA: {e}")
            return {"Summary": "", "TableAnalysis": "", "PossibleQA": []}

    def generate_image_qa(self, image_path: str, image_name: str) -> Dict[str, Any]:
        """为单张图片生成QA"""
        try:
            qa_count = 4
            content = [
              {"type": "image_url", "image_url": {"url": f"file://{image_path}"}},
              {"type": "text", "text": self.prompt_config.image_template.replace(
                "{{QA_Count}}", str(qa_count)
              ).replace("{{ImagePath}}", image_path).replace("{{ImageName}}", image_name)}
            ]
            
            result = self._generate_image_qa(content, image_path)
            
            result["image_path"] = image_path
            result["image_name"] = image_name
            
            return result
        except Exception as e:
            logger.error(f"Error generating image QA for {image_path}: {e}")
            return {"Summary": "", "ImageDescription": "", "ImageType": "", "PossibleQA": [], "image_path": image_path}

    def generate_images_batch_qa(self, images_folder: str, image_files: List[str]) -> Dict[str, Any]:
        """为图片集合生成批量QA"""
        try:
            image_count = len(image_files)
            qa_count = max(2, min(image_count, 6))  # 根据图片数量调整QA数量
            images_list = ", ".join(image_files[:10]) + ("..." if len(image_files) > 10 else "")
            content_items = []
            
            content_items = []
            
            for image_file in image_files[:10]:
              image_path = os.path.join(images_folder, image_file)
              content_items.append({
                "type": "image_url", 
                "image_url": {"url": f"file://{image_path}"}
              })
            
            text_prompt = self.prompt_config.images_batch_template.replace(
              "{{QA_Count}}", str(qa_count)
            ).replace("{{ImageCount}}", str(image_count)
            ).replace("{{ImagesFolder}}", images_folder
            ).replace("{{ImagesList}}", images_list)
            
            content_items.append({"type": "text", "text": text_prompt})
            
            result = self._generate_multi_qa(content_items)
            
            result["images_folder"] = images_folder
            result["image_count"] = image_count
            result["image_files"] = image_files
            
            return result
        except Exception as e:
            logger.error(f"Error generating batch images QA: {e}")
            return {"Summary": "", "ImagesSummary": "", "PossibleQA": [], "images_folder": images_folder}

    def generate(self, text: str) -> Dict[str, Any]:
        main_content = text
        groups = split_text_into_sentence_groups(main_content)
        if len(groups) > 1:
            return self.generate_by_groups(main_content, groups)
        else:
            return self.generate_by_single_group(main_content, groups[0])


def start_generate_generic(context: EtlContext) -> None:
    root_path = context.root
    product = context.product
    file_index = context.index
    folder_path = os.path.join(root_path, f"das/.temp/generic_output/{product}")
    folder_path_r = os.path.join(
        root_path, f"etl_generic/.temp/outputs_generate_qa/{product}"
    )
    ensure_folder_exists(folder_path)
    ensure_folder_exists(folder_path_r)
    try:
        file_path = os.path.join(folder_path, str(file_index) + ".json")
        if not os.path.exists(file_path):
            return
        logger.info(f"generate---{file_index}")
        doc_obj = json.loads(read_text_from_file(file_path))
        content = doc_obj["content"]
        tables = doc_obj["tables"]
        images = doc_obj["images_folder"]
        
        generator = QAGenerator()
        
        # 1. 为主要内容生成 QA
        logger.info(f"Generating content QA for file {file_index}")
        content_result = generator.generate(content)
        
        # 2. 为表格内容生成专门的 QA
        tables_qa = []
        if tables:
            logger.info(f"Processing tables for QA generation")
            try:
                table_qa = generator.generate_table_qa(tables)
                tables_qa.append(table_qa)
            except Exception as tb_e:
                logger.warning(f"Skipped table due to error: {tb_e}")
        else:
            logger.info("No tables to process")
        
        # 3. 为图片生成专门的 QA
        images_qa = []
        individual_images_qa = []
        
        if images and os.path.exists(images):
            try:
                image_files = [f for f in os.listdir(images) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp'))]
                
                if image_files:
                    logger.info(f"Processing {len(image_files)} images for QA generation")
                    
                    # 为图片集合生成批量QA
                    batch_qa = generator.generate_images_batch_qa(images, image_files)
                    images_qa.append(batch_qa)
                    
                    max_individual_images = 10
                    for i, image_file in enumerate(image_files[:]):
                        image_path = os.path.join(images, image_file)
                        logger.info(f"Generating QA for image {i+1}: {image_file}")
                        image_qa = generator.generate_image_qa(image_path, image_file)
                        individual_images_qa.append(image_qa)
                    
                    if len(image_files) > max_individual_images:
                        logger.info(f"Skipped individual QA for {len(image_files) - max_individual_images} images to avoid excessive API calls")
                        
            except Exception as img_e:
                logger.warning(f"Error processing images folder {images}: {img_e}")
        
        # 4. 合并所有结果
        final_result = {
            "content_qa": content_result,
            "tables_qa": tables_qa,
            "images_batch_qa": images_qa,
            "individual_images_qa": individual_images_qa,
            "metadata": {
                "file_index": file_index,
                "source_file": file_path,
                "total_content_groups": len(content_result.get("Groups", [])),
                "total_tables": len(tables_qa),
                "total_image_batches": len(images_qa),
                "total_individual_images": len(individual_images_qa),
                "processing_summary": {
                    "content_processed": bool(content),
                    "tables_processed": len(tables_qa),
                    "images_processed": len(images_qa) + len(individual_images_qa)
                }
            }
        }
        filename_r = os.path.basename(file_path)
        file_path_r = os.path.join(folder_path_r, filename_r)
        write_text_to_file(file_path_r, json.dumps(final_result, ensure_ascii=False))
        
        # 输出处理统计
        logger.info(f"QA generation completed for file {file_index}:")
        logger.info(f"  - Content groups: {final_result['metadata']['total_content_groups']}")
        logger.info(f"  - Tables processed: {final_result['metadata']['total_tables']}")
        logger.info(f"  - Image batches: {final_result['metadata']['total_image_batches']}")
        logger.info(f"  - Individual images: {final_result['metadata']['total_individual_images']}")
        logger.info(f"  - Result saved to: {file_path_r}")
    except Exception as e:
        logger.error(f"Error in generic document generation: {e}")
