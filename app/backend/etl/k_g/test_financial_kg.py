#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
金融知识图谱测试脚本
使用新创建的金融数据集构建知识图谱
"""

import sys
import os

# 添加项目路径到sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from knowlegde_graph import MedicalGraph

def test_financial_knowledge_graph():
    """测试金融知识图谱构建"""
    print("🏦 开始构建金融知识图谱...")
    
    try:
        # 创建图实例
        handler = MedicalGraph()
        print("✅ 数据库连接成功")
        
        # 创建节点
        print("📊 开始创建节点...")
        handler.create_graphnodes()
        print("✅ 节点创建完成")
        
        # 创建关系
        print("🔗 开始创建关系...")
        handler.create_graphrels()
        print("✅ 关系创建完成")
        
        print("🎉 金融知识图谱构建完成！")
        print("\n📋 数据统计:")
        print("- 金融机构: 10家 (银行、证券、保险)")
        print("- 金融行业: 10个细分领域")
        print("- 金融产品: 10种主要产品")
        print("- 关系网络: 公司-行业、公司-产品、行业关联、产品关联")
        
        print("\n💡 可以在Neo4j浏览器中查看:")
        print("- 访问: http://localhost:7474")
        print("- 用户名: neo4j")
        print("- 密码: 12345678")
        
        print("\n🔍 示例查询:")
        print("MATCH (c:Company)-[r:BELONGS_TO]->(i:Industry) RETURN c.name, i.name")
        print("MATCH (c:Company)-[r:PROVIDES]->(p:Product) RETURN c.name, p.name")
        
    except Exception as e:
        print(f"❌ 构建过程中出现错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_financial_knowledge_graph()
