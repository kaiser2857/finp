1. 数据持久化

启动 PostgreSQL 时挂载一个本地目录作为数据卷，例如：

mkdir -p $PWD/pgdata
docker run -d \
  --name rag-postgres \
  -e POSTGRES_USER=rag \
  -e POSTGRES_PASSWORD=ragpwd \
  -e POSTGRES_DB=analytics \
  -v $PWD/pgdata:/var/lib/postgresql/data \
  -p 5432:5432 postgres:15


这样数据库文件会保存在 ./pgdata 下，容器删掉也不会丢。

2. 初始化脚本（init.sql）

Postgres 支持在容器启动时加载 /docker-entrypoint-initdb.d/*.sql 脚本，所以可以准备一个 init.sql，自动建表并插入初始数据。

CREATE TABLE prices (
  symbol TEXT,
  date DATE,
  close NUMERIC
);

3. 获取 AAPL/NVDA 的真实股价

你希望缓存一份真实数据，可以用 Yahoo Finance API（免费，不需要注册账号）。Python 里常用库是 yfinance。例如：

import yfinance as yf
import pandas as pd

symbols = ["AAPL", "NVDA"]
df = yf.download(symbols, start="2024-01-01", end="2025-01-01")["Close"]

# 整理成 PostgreSQL 可导入的 CSV
df = df.reset_index().melt(id_vars=["Date"], var_name="symbol", value_name="close")
df.to_csv("prices.csv", index=False)


输出的 prices.csv 大致这样：

Date,symbol,close
2024-01-02,AAPL,182.32
2024-01-02,NVDA,490.12
...

4. 导入到 Postgres

把 prices.csv 挂载到容器里，然后用 COPY 或 psql \copy 导入：

docker cp prices.csv rag-postgres:/tmp/prices.csv

docker exec -it rag-postgres psql -U rag -d analytics -c \
  "\\copy prices(date,symbol,close) FROM '/tmp/prices.csv' CSV HEADER"


这样数据库里就有真实的 AAPL 和 NVDA 收盘价了，之后 MCP 工具就能查询。