import os
import json
import uuid
import logging
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from qdrant_client.models import PointStruct
from etl.common.context import EtlRagContext
from etl.common.hash import get_hash_folder
from etl.common.vector import VectorClient
from etl.common.file import read_text_from_file

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class EmbeddingData:
    """Represents embedding data for a question or answer."""

    embedding: List[float]
    sparse_embedding: List[Dict[str, Any]]


@dataclass
class QAObject:
    """Represents a question-answer pair with embeddings."""

    question: str
    answer: str
    question_embedding: Optional[EmbeddingData] = None
    answer_embedding: Optional[EmbeddingData] = None


@dataclass
class GroupObject:
    """Represents a group of Q&A pairs with a summary."""

    summary: str
    possible_qa: List[QAObject]


@dataclass
class TutorialObject:
    """Represents a tutorial post with groups of Q&A pairs."""

    groups: List[GroupObject]


def transform_sparse(embedding: List[Dict[str, Any]]) -> Dict[str, List[Any]]:
    """Transform sparse embedding data into a format suitable for vector storage."""
    return {
        "indices": [item["index"] for item in embedding],
        "values": [item["value"] for item in embedding],
    }


def extract_object(text: str) -> TutorialObject:
    """Extract and parse tutorial object from JSON text."""
    try:
        data = json.loads(text)
        groups = []
        for group in data.get("Groups", []):
            qa_objects = []
            for qa in group.get("PossibleQA", []):
                qa_objects.append(
                    QAObject(
                        question=qa.get("Question", ""),
                        answer=qa.get("Answer", ""),
                        question_embedding=EmbeddingData(
                            embedding=qa.get("QuestionEmbedding", {}).get(
                                "embedding", []
                            ),
                            sparse_embedding=qa.get("QuestionEmbedding", {}).get(
                                "sparse_embedding", []
                            ),
                        )
                        if "QuestionEmbedding" in qa
                        else None,
                        answer_embedding=EmbeddingData(
                            embedding=qa.get("AnswerEmbedding", {}).get(
                                "embedding", []
                            ),
                            sparse_embedding=qa.get("AnswerEmbedding", {}).get(
                                "sparse_embedding", []
                            ),
                        )
                        if "AnswerEmbedding" in qa
                        else None,
                    )
                )
            groups.append(
                GroupObject(summary=group.get("Summary", ""), possible_qa=qa_objects)
            )
        return TutorialObject(groups=groups)
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON, returning empty tutorial object")
        return TutorialObject(groups=[])


def create_point(qa: QAObject, metadata: Dict[str, Any]) -> Optional[PointStruct]:
    """Create a point structure for vector storage from a Q&A pair."""
    if not qa.question_embedding or not qa.answer_embedding:
        return None

    new_item_id = str(uuid.uuid4())
    new_item_vector = {
        "question_dense": qa.question_embedding.embedding,
        "answer_dense": qa.answer_embedding.embedding,
        "question_sparse": transform_sparse(qa.question_embedding.sparse_embedding),
        "answer_sparse": transform_sparse(qa.answer_embedding.sparse_embedding),
    }

    new_item_payload = {
        **metadata,
        "question": qa.question,
        "answer": qa.answer,
    }

    return PointStruct(id=new_item_id, vector=new_item_vector, payload=new_item_payload)


def process_group_object(
    group: GroupObject, file_index: str, question_index: int, metadata: Dict[str, Any]
) -> List[PointStruct]:
    """Process a group object and create points for vector storage."""
    points = []

    for qa in group.possible_qa:
        point = create_point(
            qa=qa,
            metadata={
                **metadata,
                "file_index": file_index,
                "question_index": question_index,
                "summary": group.summary,
            },
        )
        if point:
            points.append(point)

    return points


def start_initialize_forum_tutorial(context: EtlRagContext) -> None:
    """Initialize tutorial processing and vector storage."""
    root_path = context.root
    product = context.product
    url = context.base_url
    collection_name = f"forum_tutorial_{product}_{context.tag}"

    client = VectorClient(url)
    client.ensure_collection_exists(collection_name)

    forum_file_path = f"{root_path}/das/.temp/forum/tutorial/{product}/combined.json"
    folder_path = f"{root_path}/etl_forum_tutorial/.temp/outputs_embedding/{product}"

    thread_list = json.loads(read_text_from_file(forum_file_path))['threads']
    thread_dict = {
        f"{thread['tid']}_{thread['postDate']}": thread for thread in thread_list
    }

    for file_index in thread_dict:
        actual_folder = os.path.join(folder_path, get_hash_folder(str(file_index)))
        file_path = os.path.join(folder_path, actual_folder, str(file_index) + ".json")
        logger.info(f"Processing tutorial post: {os.path.basename(file_path)}")

        if not os.path.exists(file_path):
            logger.warning(f"File does not exist, skipping: {file_path}")
            continue

        thread = thread_dict[file_index]
        if not thread.get("content"):
            logger.warning(f"Thread content is empty, skipping: {file_index}")
            continue

        content = read_text_from_file(file_path)
        tutorial = extract_object(content)

        metadata = {
            "product": product,
            "url": thread["content"]["url"],
            "title": thread["content"]["title"],
            "category": thread["content"]["forumName"],
            "date": thread["postDate"],
        }

        for group_index, group in enumerate(tutorial.groups):
            points = process_group_object(
                group=group,
                file_index=file_index,
                question_index=group_index,
                metadata=metadata,
            )

            if points:
                client.insert_to_collection(collection_name, points)
