import os
import json

from py2neo import Graph,Node

class MedicalGraph:
    def __init__(self):
        cur_dir = '/'.join(os.path.abspath(__file__).split('/')[:-1])
        self.company_path = os.path.join(cur_dir, 'data_fin/company.json')
        self.industry_path = os.path.join(cur_dir, 'data_fin/industry.json')
        self.product_path = os.path.join(cur_dir, 'data_fin/product.json')
        self.company_industry_path = os.path.join(cur_dir, 'data_fin/company_industry.json')
        self.company_product_path = os.path.join(cur_dir, 'data_fin/company_product.json')
        self.industry_industry = os.path.join(cur_dir, 'data_fin/industry_industry.json')
        self.product_product = os.path.join(cur_dir, 'data_fin/product_product.json')
        self.g = Graph(
            "neo4j://127.0.0.1:7687",
            auth=("neo4j", "12345678"))

    def create_node(self, label, nodes):
        count = 0
        for node in nodes:
            bodies = []
            for k, v in node.items():
                body = k + ":" + "'%s'"% v
                bodies.append(body)
            query_body = ', '.join(bodies)
            try:
                sql = "CREATE (:%s{%s})"%(label, query_body)
                self.g.run(sql)
                count += 1
            except:
                pass
            print(count, len(nodes))
        return 1

    def load_data(self, filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            
            # 尝试作为JSON数组解析
            try:
                data = json.loads(content)
                if isinstance(data, list):
                    return data
                else:
                    return [data]
            except json.JSONDecodeError:
                # 如果不是标准JSON，尝试作为JSONL格式解析
                datas = []
                for line in content.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if obj:
                            datas.append(obj)
                    except json.JSONDecodeError:
                        continue
                return datas

    def create_graphnodes(self):
        company = self.load_data(self.company_path)
        product = self.load_data(self.product_path)
        industry = self.load_data(self.industry_path)
        self.create_node('company', company)
        print(len(company))
        self.create_node('product', product)
        print(len(product))
        self.create_node('industry', industry)
        print(len(industry))
        return

    def create_graphrels(self):
        company_industry = self.load_data(self.company_industry_path)
        company_product = self.load_data(self.company_product_path)
        product_product = self.load_data(self.product_product)
        industry_industry = self.load_data(self.industry_industry)
        self.create_relationship('company', 'industry', company_industry, "company_name", "industry_name")
        self.create_relationship('industry', 'industry', industry_industry, "from_industry", "to_industry")
        self.create_relationship_attr('company', 'product', company_product, "company_name", "product_name")
        self.create_relationship('product', 'product', product_product, "from_entity", "to_entity")


    def create_relationship(self, start_node, end_node, edges, from_key, end_key):
        count = 0
        for edge in edges:
            try:
                p = edge[from_key]
                q = edge[end_key]
                rel = edge["rel"]
                query = "match(p:%s),(q:%s) where p.name='%s'and q.name='%s' create (p)-[rel:%s]->(q)" % (
                start_node, end_node, p, q, rel)
                self.g.run(query)
                count += 1
                print(rel, count, all)
            except Exception as e:
                print(e)
        return


    def create_relationship_attr(self, start_node, end_node, edges, from_key, end_key):
        count = 0
        for edge in edges:
            p = edge[from_key]
            q = edge[end_key]
            rel = edge["rel"]
            weight = edge["rel_weight"]
            query = "match(p:%s),(q:%s) where p.name='%s'and q.name='%s' create (p)-[rel:%s{%s:'%s'}]->(q)" % (
                start_node, end_node, p, q, rel, "权重", weight)
            try:
                self.g.run(query)
                count += 1
                print(rel, count)
            except Exception as e:
                print(e)
        return



if __name__ == '__main__':
    handler = MedicalGraph()
    handler.create_graphnodes()
    handler.create_graphrels()