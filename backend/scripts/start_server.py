#!/usr/bin/env python3
"""
启动投资研究分析 API 服务器
"""
import os
import sys
import uvicorn
from pathlib import Path

# 设置工作目录为项目根目录
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))
os.chdir(project_root)

def main():
    print("🚀 Starting Investment Research Analytics API...")
    print(f"📁 Working directory: {os.getcwd()}")
    
    # 启动API服务器
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8787")),
        reload=True,
        reload_dirs=[str(project_root / "src")]
    )

if __name__ == "__main__":
    main()
