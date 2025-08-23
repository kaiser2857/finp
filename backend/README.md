# Investment Research Analytics - Backend

智能化投资研究分析工具的后端API系统，基于FastAPI和PostgreSQL构建，支持AI驱动的自然语言查询和灵活的图表组件系统。

## 🏗️ 项目结构

```
backend/
├── src/                    # 源代码目录
│   ├── app/               # 主应用程序
│   │   ├── main.py        # FastAPI应用入口
│   │   ├── models.py      # SQLAlchemy数据模型
│   │   ├── schemas.py     # Pydantic数据模式
│   │   ├── crud.py        # 数据库CRUD操作
│   │   ├── database.py    # 数据库连接和配置
│   │   ├── agent.py       # AI代理（OpenAI集成）
│   │   ├── component_configs.py  # 图表组件配置
│   │   ├── prompts.py     # AI提示词模板
│   │   ├── logger.py      # 日志工具
│   │   └── db.py          # 数据库查询工具
│   └── mcp_tools/         # MCP (Model Context Protocol) 工具
│       └── db_server.py   # MCP数据库服务器
├── scripts/               # 运行脚本
│   ├── start_server.py    # 启动API服务器
│   ├── start_server.bat   # Windows启动脚本
│   ├── system_check.py    # 系统检查脚本
│   └── system_check.bat   # Windows系统检查脚本
├── tests/                 # 测试文件
│   └── test_comprehensive.py  # 综合测试套件
├── database/              # 数据库相关文件
│   ├── init_schema.sql    # 数据库初始化脚本
│   └── simple_schema.sql  # 简化版数据库脚本
├── PostgreSQL/            # PostgreSQL Docker配置
│   ├── docker-compose.yml # Docker Compose配置
│   └── readme.md          # PostgreSQL设置说明
├── .env                   # 环境变量配置
├── .env.example           # 环境变量示例
└── pyproject.toml         # Poetry依赖配置
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
poetry install
```

### 2. 配置环境变量

复制并编辑环境配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置数据库连接和OpenAI API密钥。

### 3. 启动PostgreSQL数据库

```bash
cd PostgreSQL
docker-compose up -d
```

### 4. 运行系统检查

```bash
# Linux/macOS
python scripts/system_check.py

# Windows
scripts\system_check.bat
```

### 5. 启动API服务器

```bash
# Linux/macOS
python scripts/start_server.py

# Windows
scripts\start_server.bat
```

API服务器将在 http://localhost:8787 启动

## 📚 API文档

启动服务器后，访问以下地址查看API文档：

- **Swagger UI**: http://localhost:8787/docs
- **ReDoc**: http://localhost:8787/redoc
- **健康检查**: http://localhost:8787/health

## 🧪 核心功能

### 1. 智能数据查询

通过AI代理实现自然语言到SQL的转换：

```python
# 示例：向AI提问
POST /agent
{
    "question": "显示AAPL股票最近30天的K线图",
    "component_id": "some-uuid"
}
```

### 2. 灵活的图表组件系统

支持多种图表类型，基于Vega-Lite配置：

- **K线图 (Candlestick)**: OHLC数据展示
- **折线图 (Line)**: 趋势分析
- **柱状图 (Bar)**: 分类数据对比
- **指标卡 (Metric)**: 关键数据指标
- **饼图 (Pie)**: 占比分析
- **散点图 (Scatter)**: 相关性分析

### 3. 语义化数据角色

支持列的语义角色定义：

- `DIMENSION`: 维度数据（分类、标签）
- `METRIC`: 指标数据（数值、度量）
- `TIME`: 时间数据
- `OHLC_OPEN/HIGH/LOW/CLOSE`: K线数据的开高低收

### 4. MCP集成

支持Model Context Protocol，提供安全的数据库查询能力。

## 🔧 开发

### 运行测试

```bash
python -m pytest tests/ -v
```

### 代码结构说明

- **models.py**: 使用SQLAlchemy定义数据库模型，包括枚举类型和关系
- **schemas.py**: 使用Pydantic定义API请求/响应模式
- **crud.py**: 数据库CRUD操作的封装
- **agent.py**: AI代理，集成OpenAI API进行自然语言处理
- **component_configs.py**: 图表配置模板，基于JSON编码模式

### 数据库模型

系统使用以下核心实体：

1. **Dashboard**: 仪表板，包含多个组件
2. **Datasource**: 数据源，连接数据表或查询
3. **Component**: 图表组件，关联仪表板和数据源
4. **ColumnDef**: 列定义，描述数据源的字段和语义角色
5. **StockPrice**: 示例数据，存储股票价格信息

## 🛠️ 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查PostgreSQL是否运行
   - 验证`.env`文件中的数据库URL
   - 确认数据库用户权限

2. **OpenAI API错误**
   - 检查API密钥是否正确
   - 验证API额度是否充足
   - 确认网络连接

3. **依赖安装问题**
   - 使用Poetry: `poetry install`
   - 检查Python版本 (需要3.10+)

### 日志

系统日志会输出到控制台，包含：
- 数据库连接状态
- API请求处理
- AI代理执行情况
- 错误信息和警告

## 📝 贡献

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 发起Pull Request

## 📄 许可证

MIT License

## 🔗 相关文档

- [FastAPI文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy文档](https://docs.sqlalchemy.org/)
- [Vega-Lite文档](https://vega.github.io/vega-lite/)
- [OpenAI API文档](https://platform.openai.com/docs/)
