#!/usr/bin/env python3
"""
系统检查脚本 - 验证投资研究分析系统环境
"""
import os
import sys
from pathlib import Path

# 设置工作目录
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))
os.chdir(project_root)

def check_environment():
    """检查环境配置"""
    print("🔍 Checking environment...")
    
    # 检查.env文件
    env_file = project_root / ".env"
    if env_file.exists():
        print("✅ .env file found")
        with open(env_file) as f:
            env_content = f.read()
            if "DATABASE_URL" in env_content:
                print("✅ DATABASE_URL configured")
            if "OPENAI_API_KEY" in env_content:
                print("✅ OPENAI_API_KEY configured")
    else:
        print("⚠️  .env file not found")
    
    return True

def check_database_connection():
    """检查数据库连接"""
    print("\n🗄️  Checking database connection...")
    
    try:
        from app.database import SessionLocal, create_tables
        from sqlalchemy import text
        
        # 测试数据库连接
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        print("✅ Database connection successful")
        
        # 检查表结构
        if create_tables():
            print("✅ Database tables ready")
        else:
            print("⚠️  Database table creation failed")
            
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def check_models():
    """检查数据模型"""
    print("\n📊 Checking data models...")
    
    try:
        from app.models import Dashboard, Datasource, Component
        print("✅ Models imported successfully")
        
        # 测试查询
        from app.database import SessionLocal
        db = SessionLocal()
        
        dashboards = db.query(Dashboard).all()
        datasources = db.query(Datasource).all()
        components = db.query(Component).all()
        
        print(f"📈 Found {len(dashboards)} dashboards")
        print(f"🗂️  Found {len(datasources)} datasources")
        print(f"🧩 Found {len(components)} components")
        
        db.close()
        return True
    except Exception as e:
        print(f"❌ Model check failed: {e}")
        return False

def check_api():
    """检查API模块"""
    print("\n🌐 Checking API modules...")
    
    try:
        from app.main import app
        from app import crud, schemas
        print("✅ API modules loaded successfully")
        return True
    except Exception as e:
        print(f"❌ API check failed: {e}")
        return False

def main():
    print("🚀 Investment Research Analytics System Check")
    print("=" * 50)
    
    checks = [
        ("Environment", check_environment),
        ("Database", check_database_connection),
        ("Models", check_models),
        ("API", check_api)
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ {name} check crashed: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 50)
    print("📋 SYSTEM CHECK SUMMARY")
    print("=" * 50)
    
    all_passed = True
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{name:15} {status}")
        if not result:
            all_passed = False
    
    print("=" * 50)
    if all_passed:
        print("🎉 All checks passed! System is ready.")
        print("\n📝 Next steps:")
        print("1. Start the API server: python scripts/start_server.py")
        print("2. Access API docs: http://localhost:8787/docs")
        print("3. Test endpoints: http://localhost:8787/health")
    else:
        print("⚠️  Some checks failed. Please review and fix issues above.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
