import * as React from "react";
import { useState } from "react";
import { Table, Button, Progress, Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";

// 获取API基址配置
const BASE_URL = ((window as any).GC_AI_SEARCH_SERVER_URL) || (window.location.protocol + "//" + window.location.hostname + ":8000");
const API_BASE = import.meta.env.MODE === "development" ? `${BASE_URL}/api` : "/api";

interface FileStatusTableProps {
  etlFileRows: any[];
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  handleDasProcess: (row: any) => void;
  handleEtlProcess: (row: any, etlType: "embedding" | "qa" | "full") => void;
  handlePreview: (
    row: any,
    stage: "das" | "embedding" | "qa" | "full"
  ) => void;
  handleDeleteFile: (filename: string) => void;
  processing: { [k: string]: boolean };
  progressInfo: { [k: string]: { progress: number; msg: string } };
  product: string; // 添加product参数
}

const FileStatusTable: React.FC<FileStatusTableProps> = ({
  etlFileRows,
  selectedRowKeys,
  setSelectedRowKeys,
  handleDasProcess,
  handleEtlProcess,
  handlePreview,
  handleDeleteFile,
  processing,
  progressInfo,
  product, // 添加product参数
}) => {
  // Add pageSize state, default 8, and read from localStorage if exists
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem("fileStatusTablePageSize");
    return saved ? parseInt(saved, 10) : 8;
  });

  const handlePageSizeChange = (_: number, size: number) => {
    setPageSize(size);
    localStorage.setItem("fileStatusTablePageSize", String(size));
  };

  return (
    <Table
      rowKey="filename"
      columns={[
        {
          title: "文件名",
          dataIndex: "filename",
          key: "filename",
          width: 220,
          ellipsis: true,
          render: (filename: string) => {
            // 
            const fileUrl = `${API_BASE}/raw_file/${encodeURIComponent(product)}/${encodeURIComponent(filename)}`;
            return (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#1890ff',
                  textDecoration: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                }}
                title={`点击查看原始文件: ${filename}`}
              >
                {filename}
              </a>
            );
          },
        },
        {
          title: "上传时间",
          dataIndex: "uploadTime",
          key: "uploadTime",
          width: 160,
          ellipsis: true,
        },
        {
          title: "DAS处理",
          key: "das",
          width: 150,
          render: (_: any, row: any) => {
            if (row.das.status === "done")
              return (
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => handlePreview(row, "das")}>
                  预览
                </Button>
              );
            if (processing[row.filename + ":das"]) {
              const progressKey = row.filename + ":das";
              const progress = progressInfo[progressKey];
              return (
                <div style={{ width: 100 }}>
                  <Progress
                    percent={progress?.progress || 0}
                    size="small"
                    status="active"
                  />
                  {progress?.msg && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      {progress.msg.length > 20 ? progress.msg.substring(0, 20) + '...' : progress.msg}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Button size="small" type="primary" style={{ background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' }} onClick={() => handleDasProcess(row)}>
                处理
              </Button>
            );
          },
        },
        {
          title: "QA",
          key: "qa",
          width: 150,
          render: (_: any, row: any) => {
            if (row.qa.status === "done")
              return (
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => handlePreview(row, "qa")}>
                  预览
                </Button>
              );
            if (processing[row.filename + ":qa"]) {
              const progressKey = row.filename + ":qa";
              const progress = progressInfo[progressKey];
              return (
                <div style={{ width: 100 }}>
                  <Progress
                    percent={progress?.progress || 0}
                    size="small"
                    status="active"
                  />
                  {progress?.msg && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      {progress.msg.length > 20 ? progress.msg.substring(0, 20) + '...' : progress.msg}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Button
                size="small"
                type="primary"
                style={
                  row.das?.status === "done"
                    ? { borderRadius: 6, background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' }
                    : { borderRadius: 6 }
                }
                onClick={() => handleEtlProcess(row, "qa")}
                disabled={row.das.status !== "done"}
              >
                处理
              </Button>
            );
          },
        },
        {
          title: "FullAnswer(可选)",
          key: "full",
          width: 150,
          render: (_: any, row: any) => {
            if (row.full.status === "done")
              return (
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => handlePreview(row, "full")}>
                  预览
                </Button>
              );
            if (processing[row.filename + ":full"]) {
              const progressKey = row.filename + ":full";
              const progress = progressInfo[progressKey];
              return (
                <div style={{ width: 100 }}>
                  <Progress
                    percent={progress?.progress || 0}
                    size="small"
                    status="active"
                  />
                  {progress?.msg && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      {progress.msg.length > 20 ? progress.msg.substring(0, 20) + '...' : progress.msg}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Button size="small" type="primary" style={
                row.qa?.status === "done"
                  ? { borderRadius: 6, background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' }
                  : { borderRadius: 6 }
              } onClick={() => handleEtlProcess(row, "full")} disabled={
                row.das.status !== "done" ||
                row.qa.status !== "done"
              }>
                处理
              </Button>
            );
          },
        },
        {
          title: "Embedding",
          key: "embedding",
          width: 150,
          render: (_: any, row: any) => {
            if (row.embedding.status === "done")
              return (
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => handlePreview(row, "embedding")}>
                  预览
                </Button>
              );
            if (processing[row.filename + ":embedding"]) {
              const progressKey = row.filename + ":embedding";
              const progress = progressInfo[progressKey];
              return (
                <div style={{ width: 100 }}>
                  <Progress
                    percent={progress?.progress || 0}
                    size="small"
                    status="active"
                  />
                  {progress?.msg && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      {progress.msg.length > 20 ? progress.msg.substring(0, 20) + '...' : progress.msg}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Button size="small" type="primary" style={
                row.qa?.status === "done"
                  ? { borderRadius: 6, background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' }
                  : { borderRadius: 6 }
              } onClick={() => handleEtlProcess(row, "embedding")} disabled={
                row.das.status !== "done" ||
                row.qa.status !== "done"
              }>
                处理
              </Button>
            );
          },
        },
        {
          title: "操作",
          key: "actions",
          width: 80,
          render: (_: any, row: any) => (
            <Popconfirm
              title="确认删除"
              description={`确定要删除文件 "${row.filename}" 及其所有处理结果吗？`}
              onConfirm={() => handleDeleteFile(row.filename)}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ style: { background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' } }}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          ),
        },
      ]}
      dataSource={etlFileRows}
      rowSelection={{
        selectedRowKeys,
        onChange: (selectedKeys) => setSelectedRowKeys(selectedKeys),
      }}
      pagination={{
        pageSize,
        showSizeChanger: true,
        pageSizeOptions: [8, 16, 32, 64],
        onShowSizeChange: handlePageSizeChange,
        size: 'small'
      }}
      style={{ marginTop: 0, borderRadius: 8 }}
    />
  );
};

export default FileStatusTable;
