# 投资研究分析后端 - 综合测试套件

import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:8787"

class BackendTester:
    """后端API综合测试类"""
    
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.test_results = []
    
    def log_test(self, test_name, success, message=""):
        """记录测试结果"""
        status = "✅" if success else "❌"
        self.test_results.append({
            "name": test_name,
            "success": success,
            "message": message
        })
        print(f"{status} {test_name}: {message}")
    
    def test_health(self):
        """测试健康检查"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.log_test("健康检查", True, f"API正常运行 - {data.get('service', 'Unknown')}")
                return True
            else:
                self.log_test("健康检查", False, f"状态码: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("健康检查", False, f"连接失败: {e}")
            return False
    
    def test_dashboards(self):
        """测试看板管理"""
        try:
            # 获取看板列表
            response = requests.get(f"{self.base_url}/dashboards", timeout=5)
            if response.status_code == 200:
                dashboards = response.json()
                self.log_test("获取看板列表", True, f"找到 {len(dashboards)} 个看板")
                
                # 创建测试看板
                test_dashboard = {
                    "name": f"测试看板 {datetime.now().strftime('%H:%M:%S')}",
                    "description": "自动化测试创建的看板",
                    "layout": {"type": "grid", "cols": 12}
                }
                
                response = requests.post(f"{self.base_url}/dashboards", json=test_dashboard, timeout=5)
                if response.status_code == 200:
                    created = response.json()
                    self.log_test("创建看板", True, f"看板ID: {created['id']}")
                    return created['id']
                else:
                    self.log_test("创建看板", False, f"状态码: {response.status_code}")
            else:
                self.log_test("获取看板列表", False, f"状态码: {response.status_code}")
        except Exception as e:
            self.log_test("看板测试", False, f"异常: {e}")
        return None
    
    def test_datasources(self):
        """测试数据源管理"""
        try:
            response = requests.get(f"{self.base_url}/datasources", timeout=5)
            if response.status_code == 200:
                datasources = response.json()
                self.log_test("获取数据源列表", True, f"找到 {len(datasources)} 个数据源")
                
                for ds in datasources:
                    columns_count = len(ds.get('columns', []))
                    self.log_test(f"数据源 {ds['name']}", True, f"类型: {ds['type']}, 列数: {columns_count}")
                
                return datasources[0]['id'] if datasources else None
            else:
                self.log_test("获取数据源列表", False, f"状态码: {response.status_code}")
        except Exception as e:
            self.log_test("数据源测试", False, f"异常: {e}")
        return None
    
    def test_components(self, dashboard_id, datasource_id):
        """测试组件管理"""
        if not dashboard_id or not datasource_id:
            self.log_test("组件测试", False, "缺少必要的ID参数")
            return None
        
        try:
            # 创建K线图组件
            candlestick_component = {
                "dashboard_id": dashboard_id,
                "datasource_id": datasource_id,
                "type": "candlestick",
                "name": "测试K线图",
                "description": "自动化测试的K线图组件",
                "position": {"x": 0, "y": 0, "w": 8, "h": 4},
                "config": {
                    "encoding": {
                        "x": "date",
                        "open": "open",
                        "high": "high",
                        "low": "low",
                        "close": "close"
                    },
                    "mark": "candlestick",
                    "options": {
                        "color": {"up": "#26a69a", "down": "#ef5350"}
                    }
                }
            }
            
            response = requests.post(f"{self.base_url}/components", json=candlestick_component, timeout=5)
            if response.status_code == 200:
                component = response.json()
                self.log_test("创建K线图组件", True, f"组件ID: {component['id']}")
                
                # 测试获取图表上下文
                context_response = requests.get(f"{self.base_url}/components/{component['id']}/chart-context", timeout=5)
                if context_response.status_code == 200:
                    context = context_response.json()
                    self.log_test("获取图表上下文", True, f"表数量: {len(context.get('tables', []))}")
                else:
                    self.log_test("获取图表上下文", False, f"状态码: {context_response.status_code}")
                
                return component['id']
            else:
                self.log_test("创建K线图组件", False, f"状态码: {response.status_code}")
        except Exception as e:
            self.log_test("组件测试", False, f"异常: {e}")
        return None
    
    def test_ai_agent(self, component_id):
        """测试AI代理"""
        if not component_id:
            self.log_test("AI代理测试", False, "缺少组件ID")
            return
        
        try:
            agent_request = {
                "question": "显示最新的股价数据",
                "component_id": component_id
            }
            
            response = requests.post(f"{self.base_url}/agent", json=agent_request, timeout=15)
            if response.status_code == 200:
                result = response.json()
                text_response = result.get('text', '')
                if 'not available' in text_response or 'error' in text_response.lower():
                    self.log_test("AI代理查询", False, "AI功能不可用")
                else:
                    self.log_test("AI代理查询", True, f"响应长度: {len(text_response)} 字符")
            else:
                self.log_test("AI代理查询", False, f"状态码: {response.status_code}")
        except Exception as e:
            self.log_test("AI代理测试", False, f"异常: {e}")
    
    def run_all_tests(self):
        """运行全部测试"""
        print("🚀 开始投资研究分析后端综合测试")
        print("=" * 60)
        
        # 健康检查
        if not self.test_health():
            print("\n❌ 健康检查失败，无法继续测试")
            return False
        
        print("\n📊 测试看板管理...")
        dashboard_id = self.test_dashboards()
        
        print("\n🗄️ 测试数据源管理...")
        datasource_id = self.test_datasources()
        
        print("\n🧩 测试组件管理...")
        component_id = self.test_components(dashboard_id, datasource_id)
        
        print("\n🤖 测试AI代理...")
        self.test_ai_agent(component_id)
        
        # 测试总结
        print("\n" + "=" * 60)
        print("📋 测试结果总结:")
        
        success_count = sum(1 for r in self.test_results if r['success'])
        total_count = len(self.test_results)
        
        for result in self.test_results:
            status = "✅" if result['success'] else "❌"
            print(f"  {status} {result['name']}")
        
        print(f"\n📈 成功率: {success_count}/{total_count} ({success_count/total_count*100:.1f}%)")
        
        if success_count == total_count:
            print("🎉 所有测试通过！后端系统运行正常")
        elif success_count > total_count * 0.8:
            print("⚠️ 大部分测试通过，系统基本正常")
        else:
            print("❌ 多个测试失败，请检查系统状态")
        
        return success_count == total_count

def main():
    """主函数"""
    tester = BackendTester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()
