import os
import json
import argparse
import logging
from typing import List, Tuple, Optional, Dict, Any
from etl.common.file import ensure_folder_exists, write_text_to_file
from etl.common.hash import get_hash_str
from etl.common.config import app_config

logger = logging.getLogger(__name__)

# pdf processing
def get_markitdown_inst():
    try:
        from markitdown import MarkItDown
        return MarkItDown()
    except ImportError as e:
        logger.error(f"Failed to import MarkItDown: {e}")
        raise

def get_generic_marker_converter():
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.config.parser import ConfigParser

        config = {
            "output_format": "markdown",
            "use_llm": False,
        }
        
        config_parser = ConfigParser(config)
        
        converter = PdfConverter(
            config=config_parser.generate_config_dict(),
            artifact_dict=create_model_dict(),
            processor_list=config_parser.get_processors(),
            renderer=config_parser.get_renderer()
        )
        return converter
    except ImportError as e:
        logger.warning(f"Marker not available: {e}. Will use MarkItDown only.")
        return None
    except Exception as e:
        logger.error(f"Failed to create marker converter: {e}")
        return None

def get_table_marker_converter():
    try:
        from marker.converters.table import TableConverter
        from marker.models import create_model_dict
        from marker.config.parser import ConfigParser

        config = {
            "output_format": "json",
            "use_llm": False,
        }
        
        config_parser = ConfigParser(config)
        
        converter = TableConverter(
            config=config_parser.generate_config_dict(),
            artifact_dict=create_model_dict(),
            processor_list=config_parser.get_processors(),
            renderer=config_parser.get_renderer()
        )
        return converter
    except ImportError as e:
        logger.warning(f"Marker not available: {e}. Will use MarkItDown only.")
        return None
    except Exception as e:
        logger.error(f"Failed to create marker converter: {e}")
        return None

def extract_tables_and_images_with_marker(file_path: str, product: str) -> Tuple[List[str], str]:
    """
    Use marker to extract tables (as markdown) and images from PDF
    Returns (table_markdowns, images_folder_path)
    """
    tables = []
    images_folder = ""
    
    if not file_path.lower().endswith('.pdf'):
        return tables, images_folder

    # Import required modules
    from marker.output import text_from_rendered
    import shutil
    
    # Create output directory for this specific file
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    content_hash = get_hash_str(file_path)[:8]
    file_output_dir = os.path.join(
        app_config.root_path, 
        f"das/.temp/generic_output/{product}/marker_output/{base_name}_{content_hash}"
    )
    ensure_folder_exists(file_output_dir)
    
    # Set up images directory
    images_folder = os.path.join(file_output_dir, "images")
    ensure_folder_exists(images_folder)
    
    logger.info(f"Processing PDF with marker: {file_path}")
    
    # Method 1: Try TableConverter first for better table extraction
    table_converter = get_table_marker_converter()
    if table_converter:
        try:
            logger.info("Using TableConverter for table extraction")
            table_rendered = table_converter(file_path)
            table_text, table_metadata, table_images = text_from_rendered(table_rendered)
            
            # Save images if any
            if table_images:
                logger.info(f"Found {len(table_images)} images from TableConverter")
                for idx, (image_path, image_data) in enumerate(table_images.items()):
                    try:
                        # Generate a safe filename
                        image_filename = f"table_image_{idx+1}.png"
                        target_path = os.path.join(images_folder, image_filename)
                        
                        # Save image data
                        if isinstance(image_data, bytes):
                            with open(target_path, 'wb') as f:
                                f.write(image_data)
                        elif hasattr(image_data, 'save'):  # PIL Image
                            image_data.save(target_path)
                        elif os.path.exists(image_path):  # Path to existing file
                            shutil.copy2(image_path, target_path)
                        
                        logger.info(f"Saved image: {target_path}")
                    except Exception as e:
                        logger.error(f"Failed to save image {idx+1}: {e}")
            else:
                logger.info("No images found from TableConverter")
            
            return table_text, images_folder
            
        except Exception as e:
            logger.warning(f"TableConverter failed: {e}, trying PdfConverter")

def extract_text_with_marker(file_path: str, product: str) -> Tuple[List[str], str]:
    """
    Use marker to extract tables (as markdown) and images from PDF
    Returns (table_markdowns, images_folder_path)
    """

    # Import required modules
    from marker.output import text_from_rendered
    
    # Create output directory for this specific file
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    content_hash = get_hash_str(file_path)[:8]
    file_output_dir = os.path.join(
        app_config.root_path, 
        f"das/.temp/generic_output/{product}/marker_output/{base_name}_{content_hash}"
    )
    ensure_folder_exists(file_output_dir)
    
    # Method 1: Try TableConverter first for better table extraction
    text_converter = get_generic_marker_converter()
    if text_converter:
        try:
            logger.info("Using TableConverter for table extraction")
            table_rendered = text_converter(file_path)
            text, _, _ = text_from_rendered(table_rendered)
            return text
            
        except Exception as e:
            logger.warning(f"TableConverter failed: {e}, trying PdfConverter")


def collect_files(input_dir: str) -> List[Tuple[str, str]]:
    """
    Traverse the directory and collect the absolute paths of all files.
    Returns [(absolute file path, path relative to input_dir)]
    """
    file_list = []
    for root, _, files in os.walk(input_dir):
        for file in files:
            abs_path = os.path.join(root, file)
            rel_path = os.path.relpath(abs_path, input_dir)
            file_list.append((abs_path, rel_path))
    return file_list


def convert_file_to_json(
    product: str, file_path: str, rel_path: str, markitdown_inst
) -> Tuple[Dict[str, Any], str]:
    """
    Use MarkItDown to convert the file and generate a JSON object.
    Also use marker for advanced PDF processing (tables and images).
    """
    try:
        result = markitdown_inst.convert(file_path)
        content = result.text_content
    except Exception as e:
        logger.error(f"MarkItDown conversion failed for {file_path}: {e}")
        content = f"[MarkItDown conversion failed: {e}]"
    
    content_is_empty = False
    if file_path.lower().endswith('.pdf') and (not content or content.strip() == "" or len(content.strip()) < 50):
      content_is_empty = True
      logger.info(f"PDF appears to be scanned or has minimal text content, trying marker extraction")
    if content_is_empty:
      text = extract_text_with_marker(file_path, product)
      content = text
    # Extract tables and images using marker (for PDF files)
    tables = []
    images_folder = ""
    
    if file_path.lower().endswith('.pdf'):
        try:
            tables, images = extract_tables_and_images_with_marker(file_path, product)
        except Exception as e:
            logger.error(f"Marker extraction failed for {file_path}: {e}")
    
    return {
        "product": product,
        "url": os.path.abspath(file_path),
        "title": os.path.basename(file_path),
        "category": os.path.dirname(rel_path),
        "content": content,
        "tables": tables,  # List of markdown tables
        "images_folder": images_folder,  # Path to extracted images
        "file_type": os.path.splitext(file_path)[1].lower()
    }, content

def process_files(
    product: str,
    files: List[Tuple[str, str]],
    markitdown_inst,
    output_dir: str,
) -> None:
    """
    Convert and save all files to JSON in the output directory.
    """
    for idx, (file_path, rel_path) in enumerate(files):
        doc_json, content = convert_file_to_json(
            product, file_path, rel_path, markitdown_inst
        )
        content_hash = get_hash_str(content)[:12]
        rel_path_underscored = rel_path.replace(os.sep, "_")
        output_file = os.path.join(
            output_dir, f"{rel_path_underscored}_{content_hash}.json"
        )
        try:
            write_text_to_file(output_file, json.dumps(doc_json, ensure_ascii=False))
            logger.info(f"[{idx + 1}/{len(files)}] Saved {output_file}")
            
        except Exception as e:
            logger.error(f"Failed to write {output_file}: {e}")

def das_generic_single_file(product: str, filename: str): 
    input_dir = os.path.join(app_config.root_path, f"das/.temp/generic_input/{product}")
    output_dir = os.path.join(app_config.root_path, f"das/.temp/generic_output/{product}")
    
    ensure_folder_exists(input_dir)
    ensure_folder_exists(output_dir)
    
    # Check if the specific file exists
    file_path = os.path.join(input_dir, filename)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {filename} not found in {input_dir}")
    
    # Process only the specific file
    rel_path = filename  # Since it's directly in the input_dir
    files = [(file_path, rel_path)]
    
    logger.info(f"MarkItDown instance is getting")
    markitdown_inst = get_markitdown_inst()
    logger.info(f"MarkItDown instance created")
    
    process_files(product, files, markitdown_inst, output_dir)

def das_generic_main(
    product: str,
    input_dir: Optional[str] = None,
    output_dir: Optional[str] = None,
) -> None:
    """
    Main entry for generic DAS processing.
    """
    if input_dir is None:
        input_dir = os.path.join(
            app_config.root_path, f"das/.temp/generic_input/{product}"
        )
    if output_dir is None:
        output_dir = os.path.join(
            app_config.root_path, f"das/.temp/generic_output/{product}"
        )

    ensure_folder_exists(input_dir)
    ensure_folder_exists(output_dir)

    logger.info(f"MarkItDown instance is getting")
    markitdown_inst = get_markitdown_inst()
    logger.info(f"MarkItDown instance created")

    files = collect_files(input_dir)
    logger.info(f"Found {len(files)} files in {input_dir}")
    process_files(product, files, markitdown_inst, output_dir)
    logger.info(f"Collected {len(files)} files, output to {output_dir}")


def cli():
    parser = argparse.ArgumentParser(
        description="Batch collect all documents in the directory as JSON, convert content to plain text with MarkItDown, and output to das/.temp/generic_output/{product}/"
    )
    parser.add_argument("--product", type=str, required=True, help="Product name")
    parser.add_argument(
        "--input_dir",
        type=str,
        required=False,
        help="Input directory (default: root_path/das/.temp/generic_input/{product}/)",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        required=False,
        help="Output directory (default: root_path/das/.temp/generic_output/{product}/)",
    )
    args = parser.parse_args()
    das_generic_main(args.product, args.input_dir, args.output_dir)


if __name__ == "__main__":
    cli()
