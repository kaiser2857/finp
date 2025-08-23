# """
# 知识图谱构建与分析路由器
# 集成节点生成、图谱构建、社区检测、PageRank分析等功能
# """

# import json
# import os
# import time
# from typing import List, Dict, Any, Optional
# from http import HTTPStatus
# import networkx as nx
# import matplotlib.pyplot as plt
# import matplotlib
# matplotlib.use('Agg')  # 使用非交互式后端
# import numpy as np
# from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
# from fastapi.responses import FileResponse, JSONResponse
# from pydantic import BaseModel
# import community as community_louvain
# from qdrant_client import QdrantClient, models

# from etl.common.embedding import embedding_multiple_text
# from etl.config import get_qdrant_config

# router = APIRouter()

# # 数据模型
# class NodeGenerateRequest(BaseModel):
#     collection_name: str
#     batch_size: int = 100
#     output_path: Optional[str] = None
    
# class GraphAnalysisRequest(BaseModel):
#     json_file_path: str
#     output_dir: Optional[str] = None
#     min_similarity: float = 0.5
    
# class SearchRequest(BaseModel):
#     query: str
#     collection_name: str
#     limit: int = 10

# class GraphVisualizationRequest(BaseModel):
#     json_file_path: str
#     output_path: Optional[str] = None
#     layout_type: str = "spring"  # spring, circular, random, shell

# # 配置和集合映射
# collection_name_map = {
#     "doc": {
#         "forguncy": "doc_forguncy_prod",
#         "wyn": "doc_wyn_prod", 
#         "spreadjs": "doc_spreadjs_prod",
#         "gcexcel": "doc_gcexcel_prod",
#     },
#     "forum_qa": {
#         "forguncy": "forum_qa_forguncy_prod",
#         "wyn": "forum_qa_wyn_prod",
#         "spreadjs": "forum_qa_spreadjsgcexcel_prod",
#         "gcexcel": "",
#     },
#     "forum_tutorial": {
#         "forguncy": "forum_tutorial_forguncy_prod",
#         "wyn": "forum_tutorial_wyn_prod",
#         "spreadjs": "forum_tutorial_spreadjsgcexcel_prod",
#         "gcexcel": "",
#     },
# }

# def get_qdrant_client():
#     """获取Qdrant客户端"""
#     config = get_qdrant_config()
#     return QdrantClient(
#         host=config["host"],
#         port=config["port"],
#         timeout=config.get("timeout", 60)
#     )

# def transform_sparse(embedding):
#     """转换稀疏向量格式"""
#     return {
#         "indices": [item["index"] for item in embedding],
#         "values": [item["value"] for item in embedding],
#     }

# def get_embedding_pair(inputs: List):
#     """获取文本嵌入向量"""
#     resp = embedding_multiple_text(inputs)
#     if resp.status_code == HTTPStatus.OK:
#         return resp.output["embeddings"][0]
#     else:
#         return {"embedding": [], "sparse_embedding": []}

# def distinct_search_hits(hits):
#     """去重搜索结果"""
#     seen_ids = set()
#     unique_data = []
    
#     for hit in hits:
#         key = (
#             str(hit.payload["file_index"])
#             + "_"
#             + str(hit.payload.get("group_index", "_"))
#             + "_"
#             + str(hit.payload["question_index"])
#         )
#         if key not in seen_ids:
#             seen_ids.add(key)
#             unique_data.append(hit)
    
#     return unique_data

# def search_semantic_hybrid_single_pair(client: QdrantClient, pair, collection):
#     """语义混合搜索单个配对"""
#     dense = pair["question_dense"]
#     sparse = pair["question_sparse"]
    
#     result = client.query_points(
#         collection_name=collection,
#         prefetch=[
#             models.Prefetch(
#                 query=dense, using="question_dense", limit=20, score_threshold=0.4
#             ),
#             models.Prefetch(
#                 query=dense, using="answer_dense", limit=20, score_threshold=0.4
#             ),
#             models.Prefetch(
#                 query=models.SparseVector(indices=sparse.indices, values=sparse.values),
#                 using="question_sparse",
#                 limit=20,
#             ),
#             models.Prefetch(
#                 query=models.SparseVector(indices=sparse.indices, values=sparse.values),
#                 using="answer_sparse",
#                 limit=20,
#             ),
#         ],
#         query=models.FusionQuery(fusion=models.Fusion.RRF),
#         limit=8,
#         score_threshold=0.4,
#     )
#     return distinct_search_hits(result.points)

# def batch_process_points(client: QdrantClient, collection_name: str, batch_size: int = 100):
#     """批量处理数据点生成节点关系"""
#     all_data = []
#     offset = None
    
#     while True:
#         try:
#             result = client.scroll(
#                 collection_name=collection_name,
#                 limit=batch_size,
#                 offset=offset,
#                 with_payload=True,
#                 with_vectors=["question_dense", "question_sparse"]
#             )
            
#             points, next_offset = result
            
#             if not points:
#                 break
                
#             for point in points:
#                 try:
#                     pair = {
#                         "question_dense": point.vector.get("question_dense", []),
#                         "question_sparse": transform_sparse(point.vector.get("question_sparse", []))
#                     }
                    
#                     search_results = search_semantic_hybrid_single_pair(client, pair, collection_name)
                    
#                     point_data = {
#                         "id": point.id,
#                         "payload": point.payload,
#                         "similar_points": []
#                     }
                    
#                     for result in search_results:
#                         if str(result.id) != str(point.id):
#                             point_data["similar_points"].append({
#                                 "id": result.id,
#                                 "score": result.score,
#                                 "payload": result.payload
#                             })
                    
#                     all_data.append(point_data)
                    
#                 except Exception as e:
#                     print(f"处理点 {point.id} 时出错: {e}")
#                     continue
            
#             offset = next_offset
#             if not next_offset:
#                 break
                
#         except Exception as e:
#             print(f"批量处理出错: {e}")
#             break
    
#     return all_data

# def build_graph_from_json(json_file_path: str, min_similarity: float = 0.5):
#     """从JSON文件构建NetworkX图"""
#     try:
#         with open(json_file_path, 'r', encoding='utf-8') as f:
#             data = json.load(f)
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"读取JSON文件失败: {e}")
    
#     G = nx.Graph()
    
#     # 添加节点和边
#     for item in data:
#         node_id = str(item['id'])
#         G.add_node(node_id, **item['payload'])
        
#         # 添加相似节点之间的边
#         for similar in item.get('similar_points', []):
#             if similar['score'] >= min_similarity:
#                 similar_id = str(similar['id'])
#                 G.add_edge(node_id, similar_id, weight=similar['score'])
    
#     return G

# def analyze_graph(G: nx.Graph):
#     """分析图的各种指标"""
#     analysis = {}
    
#     # 基本统计
#     analysis['basic_stats'] = {
#         'num_nodes': G.number_of_nodes(),
#         'num_edges': G.number_of_edges(),
#         'density': nx.density(G),
#         'is_connected': nx.is_connected(G)
#     }
    
#     if G.number_of_nodes() > 0:
#         # 连通分量
#         components = list(nx.connected_components(G))
#         analysis['connected_components'] = {
#             'count': len(components),
#             'largest_size': len(max(components, key=len)) if components else 0
#         }
        
#         # 中心性指标
#         try:
#             analysis['centrality'] = {
#                 'degree': dict(nx.degree_centrality(G)),
#                 'betweenness': dict(nx.betweenness_centrality(G)),
#                 'closeness': dict(nx.closeness_centrality(G)),
#                 'pagerank': dict(nx.pagerank(G))
#             }
#         except:
#             analysis['centrality'] = {}
        
#         # 社区检测
#         try:
#             partition = community_louvain.best_partition(G)
#             analysis['communities'] = {
#                 'partition': partition,
#                 'modularity': community_louvain.modularity(partition, G),
#                 'num_communities': len(set(partition.values()))
#             }
#         except:
#             analysis['communities'] = {}
    
#     return analysis

# def find_shortest_paths(G: nx.Graph, source_nodes: List[str], target_nodes: List[str]):
#     """查找最短路径"""
#     paths = {}
    
#     for source in source_nodes:
#         if source in G:
#             for target in target_nodes:
#                 if target in G and source != target:
#                     try:
#                         path = nx.shortest_path(G, source, target)
#                         length = len(path) - 1
#                         paths[f"{source}->{target}"] = {
#                             'path': path,
#                             'length': length
#                         }
#                     except nx.NetworkXNoPath:
#                         paths[f"{source}->{target}"] = None
    
#     return paths

# def visualize_graph(G: nx.Graph, output_path: str, layout_type: str = "spring"):
#     """可视化图并保存"""
#     plt.figure(figsize=(12, 8))
    
#     # 选择布局
#     if layout_type == "spring":
#         pos = nx.spring_layout(G, k=1, iterations=50)
#     elif layout_type == "circular":
#         pos = nx.circular_layout(G)
#     elif layout_type == "random":
#         pos = nx.random_layout(G)
#     elif layout_type == "shell":
#         pos = nx.shell_layout(G)
#     else:
#         pos = nx.spring_layout(G)
    
#     # 绘制图
#     nx.draw(G, pos, 
#             node_color='lightblue',
#             node_size=50,
#             with_labels=False,
#             edge_color='gray',
#             alpha=0.7)
    
#     plt.title(f"知识图谱可视化 (节点: {G.number_of_nodes()}, 边: {G.number_of_edges()})")
#     plt.savefig(output_path, dpi=300, bbox_inches='tight')
#     plt.close()

# # API路由
# @router.post("/generate-nodes")
# async def generate_nodes(request: NodeGenerateRequest, background_tasks: BackgroundTasks):
#     """生成节点关系数据"""
#     try:
#         client = get_qdrant_client()
        
#         # 批量处理生成节点数据
#         all_data = batch_process_points(client, request.collection_name, request.batch_size)
        
#         # 保存到文件
#         output_path = request.output_path or f"nodes_{request.collection_name}_{int(time.time())}.json"
#         os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
#         with open(output_path, 'w', encoding='utf-8') as f:
#             json.dump(all_data, f, ensure_ascii=False, indent=2)
        
#         return {
#             "status": "success",
#             "message": f"成功生成 {len(all_data)} 个节点",
#             "output_path": output_path,
#             "node_count": len(all_data)
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"生成节点失败: {str(e)}")

# @router.post("/build-graph")
# async def build_graph(request: GraphAnalysisRequest):
#     """从JSON文件构建知识图谱并分析"""
#     try:
#         # 构建图
#         G = build_graph_from_json(request.json_file_path, request.min_similarity)
        
#         # 分析图
#         analysis = analyze_graph(G)
        
#         # 保存分析结果
#         output_dir = request.output_dir or "graph_analysis"
#         os.makedirs(output_dir, exist_ok=True)
        
#         analysis_path = os.path.join(output_dir, f"analysis_{int(time.time())}.json")
#         with open(analysis_path, 'w', encoding='utf-8') as f:
#             json.dump(analysis, f, ensure_ascii=False, indent=2)
        
#         return {
#             "status": "success",
#             "analysis": analysis,
#             "analysis_path": analysis_path
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"构建图谱失败: {str(e)}")

# @router.post("/visualize-graph")
# async def visualize_graph_endpoint(request: GraphVisualizationRequest):
#     """可视化知识图谱"""
#     try:
#         # 构建图
#         G = build_graph_from_json(request.json_file_path)
        
#         # 可视化
#         output_path = request.output_path or f"graph_viz_{int(time.time())}.png"
#         os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
#         visualize_graph(G, output_path, request.layout_type)
        
#         return {
#             "status": "success",
#             "message": "图谱可视化完成",
#             "output_path": output_path,
#             "graph_stats": {
#                 "nodes": G.number_of_nodes(),
#                 "edges": G.number_of_edges()
#             }
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"可视化失败: {str(e)}")

# @router.get("/download-visualization/{filename}")
# async def download_visualization(filename: str):
#     """下载可视化图片"""
#     if not os.path.exists(filename):
#         raise HTTPException(status_code=404, detail="文件不存在")
    
#     return FileResponse(
#         path=filename,
#         media_type='image/png',
#         filename=os.path.basename(filename)
#     )

# @router.post("/find-paths")
# async def find_paths(
#     json_file_path: str,
#     source_nodes: List[str],
#     target_nodes: List[str],
#     min_similarity: float = 0.5
# ):
#     """查找节点间的最短路径"""
#     try:
#         # 构建图
#         G = build_graph_from_json(json_file_path, min_similarity)
        
#         # 查找路径
#         paths = find_shortest_paths(G, source_nodes, target_nodes)
        
#         return {
#             "status": "success",
#             "paths": paths,
#             "graph_stats": {
#                 "nodes": G.number_of_nodes(),
#                 "edges": G.number_of_edges()
#             }
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"路径查找失败: {str(e)}")

# @router.post("/semantic-search")
# async def semantic_search(request: SearchRequest):
#     """语义搜索"""
#     try:
#         client = get_qdrant_client()
        
#         # 获取查询向量
#         embedding_pair = get_embedding_pair([request.query])
#         if not embedding_pair.get("embedding"):
#             raise HTTPException(status_code=400, detail="无法获取查询向量")
        
#         # 搜索
#         pair = {
#             "question_dense": embedding_pair["embedding"],
#             "question_sparse": transform_sparse(embedding_pair["sparse_embedding"])
#         }
        
#         results = search_semantic_hybrid_single_pair(client, pair, request.collection_name)
        
#         # 格式化结果
#         formatted_results = []
#         for result in results[:request.limit]:
#             formatted_results.append({
#                 "id": result.id,
#                 "score": result.score,
#                 "payload": result.payload
#             })
        
#         return {
#             "status": "success",
#             "query": request.query,
#             "results": formatted_results,
#             "count": len(formatted_results)
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

# @router.get("/collections")
# async def get_collections():
#     """获取可用的集合列表"""
#     return {
#         "status": "success",
#         "collections": collection_name_map
#     }

# @router.get("/graph-stats/{json_file_path:path}")
# async def get_graph_stats(json_file_path: str, min_similarity: float = Query(0.5)):
#     """获取图谱统计信息"""
#     try:
#         G = build_graph_from_json(json_file_path, min_similarity)
#         analysis = analyze_graph(G)
        
#         return {
#             "status": "success",
#             "stats": analysis["basic_stats"],
#             "components": analysis.get("connected_components", {}),
#             "communities": analysis.get("communities", {})
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")
