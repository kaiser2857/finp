from typing import List
from http import HTTPStatus
from qdrant_client import QdrantClient, models
import logging

from rag.common.embedding import create_embedding
from rag.services.product import get_generic_products

# Initialize logger
logger = logging.getLogger(__name__)

collection_name_map = {
    "doc": {
        "forguncy": "doc_forguncy_prod",
        "wyn": "doc_wyn_prod",
        "spreadjs": "doc_spreadjs_prod",
        "gcexcel": "doc_gcexcel_prod",
    },
    "forum_qa": {
        "forguncy": "forum_qa_forguncy_prod",
        "wyn": "forum_qa_wyn_prod",
        "spreadjs": "forum_qa_spreadjsgcexcel_prod",
        "gcexcel": "",
    },
    "forum_tutorial": {
        "forguncy": "forum_tutorial_forguncy_prod",
        "wyn": "forum_tutorial_wyn_prod",
        "spreadjs": "forum_tutorial_spreadjsgcexcel_prod",
        "gcexcel": "",
    },
}


def transform_sparse(embedding):
    return {
        "indices": [item["index"] for item in embedding],
        "values": [item["value"] for item in embedding],
    }


def get_embedding_pair(inputs: List):
    resp = create_embedding(inputs)

    if resp.status_code == HTTPStatus.OK:
        return resp.output["embeddings"][0]
    else:
        return {"embedding": [], "sparse_embedding": []}


def distinct_clean_search_hits(hits):
    seen_ids = set()
    unique_data = []

    for hit in hits:
        key = (
            str(hit.payload["file_index"])
            + "_"
            + str(hit.payload.get("group_index", "_"))
            + "_"
            + str(hit.payload["question_index"])
        )
        if key not in seen_ids:
            seen_ids.add(key)
            unique_data.append(hit)

            # clean id&version information to avoid AI generation's mistake
            hit.id = None
            hit.version = None

    return unique_data


def search_sementic_hybrid(client: QdrantClient, query, product):
    all_hits = []

    if product == "generic":
        generic_products = get_generic_products()
        products_to_search = [prod["id"] for prod in generic_products]
        
        # TODO 如果没有获取到动态产品列表，使用固定列表作为fallback
        if not products_to_search:
            products_to_search = ["test1", "test2", "test3", "test4"]
            logger.warning("Failed to get dynamic product list, using fallback list")
        
        logger.info(f"Searching across knowledge bases: {products_to_search}")
        
        for prod in products_to_search:
            categories = ["doc", "forum_qa", "forum_tutorial"]
            for category in categories:
                try:
                    collection_name = collection_name_map[category].get(prod, "")
                    if collection_name:  #
                        hits = search_sementic_hybrid_single(client, query, collection_name)
                        for hit in hits:
                            hit.payload["collection_category"] = category
                            hit.payload["product"] = prod
                        all_hits += hits
                except Exception as e:
                    logger.error(f"Error searching {category} {prod}: {e}")

            try:
                hits = search_sementic_hybrid_single(client, query, f"generic_{prod}_prod")
                for hit in hits:
                    hit.payload["collection_category"] = "generic"
                    hit.payload["product"] = prod
                all_hits += hits
            except Exception as e:
                logger.error(f"Error searching generic {prod}: {e}")
    else:
        categories = ["doc", "forum_qa", "forum_tutorial"]
        for category in categories:
            try:
                collection_name = collection_name_map[category].get(product, "")
                if collection_name:
                    hits = search_sementic_hybrid_single(client, query, collection_name)
                    for hit in hits:
                        hit.payload["collection_category"] = category
                    all_hits += hits
            except Exception as e:
                logger.error(f"Error searching {category} {product}: {e}")

        try:
            hits = search_sementic_hybrid_single(client, query, f"generic_{product}_prod")
            for hit in hits:
                hit.payload["collection_category"] = "generic"
            all_hits += hits
        except Exception as e:
            logger.error(f"Error searching generic {product}: {e}")
    
    from rag.common.config import app_config
    # Fix URL - convert relative paths to full URLs
    for hit in all_hits:
        if 'url' in hit.payload and hit.payload['url'].startswith('/'):
            hit.payload['url'] = f"{app_config.url_location}{hit.payload['url']}"
    
    return sorted(all_hits, key=lambda x: x.score, reverse=True)


def search_sementic_hybrid_single(client: QdrantClient, query, collection):
    pair = get_embedding_pair([query])
    dense = pair["embedding"]
    sparse = transform_sparse(pair["sparse_embedding"])

    result = client.query_points(
        collection_name=collection,
        prefetch=[
            models.Prefetch(
                query=dense, using="question_dense", limit=40, score_threshold=0.4
            ),
            models.Prefetch(
                query=dense, using="answer_dense", limit=40, score_threshold=0.4
            ),
            models.Prefetch(
                query=models.SparseVector(
                    indices=sparse["indices"], values=sparse["values"]
                ),
                using="question_sparse",
                limit=40,
            ),
            models.Prefetch(
                query=models.SparseVector(
                    indices=sparse["indices"], values=sparse["values"]
                ),
                using="answer_sparse",
                limit=40,
            ),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        limit=8,
        score_threshold=0.4,
    )
    return distinct_clean_search_hits(result.points)
