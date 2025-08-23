import logging
from typing import Literal
import argparse
import sys

from etl.common.config import app_config
from etl.common.context import EtlRagContext
from etl.common.log import setup_logging
from etl.ved.initialize_doc import start_initialize_doc
from etl.ved.initialize_forum_qa import start_initialize_forum_qa
from etl.ved.initialize_forum_tutorial import start_initialize_forum_tutorial
from etl.ved.initialize_generic import start_initialize_generic
from etl.ved.update_aliases import (
    start_update_aliases,
    start_update_aliases_by_product,
)

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)

DocType = Literal["doc", "forum/qa", "forum/tutorial", "generic"]
ProductType = Literal["forguncy", "wyn", "spreadjs", "gcexcel", "spreadjsgcexcel"]


def ved_index_start(doc_type: DocType, product: ProductType, tag: str) -> None:
    """
    Initialize RAG indexing for a specific document type and product.

    Args:
        doc_type: Type of document to index ("doc", "forum/qa", or "forum/tutorial")
        product: Product name to index documents for
        tag: Tag identifier for the indexing process

    Returns:
        None
    """
    logger.info(f"Current document type: {doc_type}")
    logger.info(f"Current product name: {product}")
    logger.info(f"Current tag name: {tag}")

    logger.info("Starting execution")

    base_url = app_config.vector_db.host
    root_path = app_config.root_path

    context = EtlRagContext(root_path, doc_type, product, base_url, tag)

    if doc_type == "doc":
        start_initialize_doc(context)
    elif doc_type == "forum/qa":
        start_initialize_forum_qa(context)
    elif doc_type == "forum/tutorial":
        start_initialize_forum_tutorial(context)
    elif doc_type == "generic":
        start_initialize_generic(context)


def ved_update_collections_aliases(tag: str) -> None:
    """
    Update collection aliases in the vector database.

    Args:
        tag: Tag identifier for the update process

    Returns:
        None
    """
    base_url = app_config.vector_db.host
    start_update_aliases(base_url, tag)


def ved_update_collections_aliases_by_product(product: ProductType, tag: str) -> None:
    """
    Update collection aliases in the vector database for a specific product.

    Args:
        product: Product name to update aliases for
        tag: Tag identifier for the update process

    Returns:
        None
    """
    base_url = app_config.vector_db.host
    start_update_aliases_by_product(base_url, product, tag)