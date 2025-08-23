"""
QA 生成器配置示例
展示如何为文本、表格和图片配置不同的模型
"""

from etl.etl.etl_generic.generate import PromptConfig

# 示例 1: 使用 OpenAI 模型的配置
openai_config = PromptConfig(
    # 文本处理模型配置
    text_model_config={
        "model_type": "text",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3
    },
    
    # 表格分析模型配置（使用更强的模型）
    table_model_config={
        "model_type": "text",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 3000,
        "temperature": 0.2
    },
    
    # 多模态图片分析模型配置
    image_model_config={
        "model_type": "multimodal",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3,
        "vision_enabled": True
    }
)

# 示例 2: 使用本地模型的配置
local_config = PromptConfig(
    # 本地文本模型
    text_model_config={
        "model_type": "text",
        "api_base": "http://localhost:11434/v1",
        "model_name": "llama3.1:8b",
        "api_key_env": "LOCAL_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3
    },
    
    # 本地表格分析模型
    table_model_config={
        "model_type": "text",
        "api_base": "http://localhost:11434/v1",
        "model_name": "llama3.1:70b",
        "api_key_env": "LOCAL_API_KEY",
        "max_tokens": 3000,
        "temperature": 0.2
    },
    
    # 本地多模态模型
    image_model_config={
        "model_type": "multimodal",
        "api_base": "http://localhost:11434/v1",
        "model_name": "llava:13b",
        "api_key_env": "LOCAL_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3,
        "vision_enabled": True
    }
)

# 示例 3: 混合配置（不同类型用不同服务商）
hybrid_config = PromptConfig(
    # 文本用 OpenAI
    text_model_config={
        "model_type": "text",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3
    },
    
    # 表格用 Claude
    table_model_config={
        "model_type": "text",
        "api_base": "https://api.anthropic.com",
        "model_name": "claude-3-sonnet-20240229",
        "api_key_env": "ANTHROPIC_API_KEY",
        "max_tokens": 3000,
        "temperature": 0.2
    },
    
    # 图片用 OpenAI Vision
    image_model_config={
        "model_type": "multimodal",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3,
        "vision_enabled": True
    }
)

# 自定义 Prompt 模板示例
custom_prompts_config = PromptConfig(
    # 自定义表格分析模板
    table_template="""## instruction
我需要分析以下表格数据，请帮我：
1. 总结表格的主要内容和结构
2. 识别关键数据点和趋势
3. 生成{{QA_Count}}个不同类型的问题和答案

## output schema
{"Summary":"表格总结","TableAnalysis":"深度分析","PossibleQA":[{"Question":"问题","Answer":"答案","QueryType":"查询类型"}]}

## 表格数据
{{TableContent}}
""",
    
    # 自定义图片分析模板
    image_template="""## instruction
请仔细分析这张图片，我需要：
1. 描述图片的主要内容
2. 识别图片类型和用途
3. 生成{{QA_Count}}个相关问题和答案

## output schema
{"Summary":"图片概述","ImageDescription":"详细描述","ImageType":"图片类型","PossibleQA":[{"Question":"问题","Answer":"答案","QueryType":"查询类型"}]}

## 图片信息
文件路径：{{ImagePath}}
文件名：{{ImageName}}
""",
    
    # 使用默认的模型配置
    text_model_config={
        "model_type": "text",
        "api_base": "https://api.openai.com/v1",
        "model_name": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "max_tokens": 2000,
        "temperature": 0.3
    }
)

# 使用配置的示例
def create_qa_generator_with_config():
    """
    创建带有自定义配置的 QA 生成器
    """
    from etl.etl.etl_generic.generate import QAGenerator
    
    # 选择一个配置
    config = openai_config  # 可以换成其他配置
    
    # 创建生成器
    generator = QAGenerator(prompt_config=config)
    
    return generator

# 环境变量设置示例
ENVIRONMENT_VARIABLES = """
# OpenAI 配置
export OPENAI_API_KEY="sk-your-openai-api-key"

# Anthropic 配置
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"

# 本地模型配置
export LOCAL_API_KEY="your-local-api-key-if-needed"

# 其他可能需要的环境变量
export MODEL_CACHE_DIR="/path/to/model/cache"
export MAX_CONCURRENT_REQUESTS="5"
"""

if __name__ == "__main__":
    print("QA Generator 配置示例")
    print("=" * 50)
    
    generator = create_qa_generator_with_config()
    print(f"生成器创建成功，使用配置：{type(generator.prompt_config).__name__}")
    
    print("\n模型配置：")
    print(f"文本模型：{generator.prompt_config.text_model_config['model_name']}")
    print(f"表格模型：{generator.prompt_config.table_model_config['model_name']}")
    print(f"图片模型：{generator.prompt_config.image_model_config['model_name']}")
